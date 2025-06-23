---
title: Building a language server
---

# The beginning

Story ahead, skip to the [next section](#preface) for actual technical writing.

The [uxn](https://wiki.xxiivv.com/site/uxn.html) ecosystem is my current rabbithole.
It deserves its own post but [the language](https://wiki.xxiivv.com/site/uxntal.html) itself has captured my interest.
Unlike Forth, I actually feel like I can understand it.

But while learning and experimenting with the language, I miss having certain tools at my disposal.
Namely: a step debugger and a language server.
So I decided to just [build](https://github.com/bullno1/buxn-dbg) [them](https://github.com/bullno1/buxn-ls).
While the debugger is relatively straightforward since it was not my first time building one [^1], the language server was a challenge.

![without-node-js-right?](https://user-images.githubusercontent.com/17090999/121807421-10ef3a80-cc22-11eb-95ea-93a9111389c1.png)

Turned out, I'm not the [only one](https://github.com/microsoft/vscode-extension-samples/issues/447).
The [official guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide) requires installing a Typescript framework and obscure most of the interactions.
My [uxntal assembler](https://github.com/bullno1/buxn) is written in C so Node.js just adds more unnecessary complexity.
The protocol [specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) is comprehensive but perhaps too comprehensive and it is daunting to read through.
It is also a reference instead of an implementation guide.
There seems to be no guide for implementation that does not use Typescript.

But then by sheer luck, when I was experimenting with generating [ctags](https://docs.ctags.io/en/latest/man/ctags.1.html#tag-file-format), I stumbled upon [ctags-lsp](https://github.com/netmute/ctags-lsp).
It was actually pretty simple to read and got me started.
After being somewhat happy with the current state of my language server, I guess it is time to document the process so people won't have to go through the same trouble again.

# Preface

This guide will be written to be as language-agnostic as possible.
It will also assume no framework other than standard library, OS API or commonly available libraries such as JSON parser.
However, keep in mind that it was based on my experience implementing a language server for [uxntal](https://wiki.xxiivv.com/site/uxntal.html), using C11 and [my own async I/O framework](https://github.com/bullno1/bio).
That said, what is written here should hopefully be transferrable.

The goal is to implement a language server that is capable of:

* Live diagnostic: Indicate syntax errors, warnings, etc as the document is being edited
* Auto-complete: Both automatic based on a trigger character (e.g: ".") and user-triggered (e.g: "Ctrl+Space")
* Go to definition
* Find references
* Symbol listing

This should cover the bare minimum of what is expected of a language server.

There will be frequent references to the official specification instead of repeating it.
This guide is not meant to replace the specification but to offer a guided tour through that huge document.

The reader is assumed to be a language implementer or someone who is highly knowledgeable about the supported language's compiler infrastructure.
Changes might have to be made to the language's backend in order to support some features.

# The base protocol

The [specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#baseProtocol) for this part is pretty simple to read so this section will be short.
It is a pseudo-HTTP protocol [^2].
There is no method, only header and body.
The `Content-Length` header is mandatory and the body contains a JSON-RPC message.

Confusingly, the actual channel to transport these messages are not mentioned anywhere in the introductory section.
Instead it is pushed to [the end](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#implementationConsiderations).
There are several channels: stdio, pipe, socket...
Despite what is said in that section, popular servers such as `clangd` generally only support one channel: `stdio`.
That also leads to some [clients](https://github.com/zed-industries/zed/issues/8498) only supporting that.
I have not seen any server supporting switching channels using the suggested CLI arg structure either (i.e: `server socket --port=<port>`).

## Implementation considerations

As long as your language/runtime has a way to interact with stdio or socket, this should be simple to implement.
The `stdio` channel seems to be the most commonly supported.
However, it comes with quite a number of problems:

* stderr is used for logging.
  However, since the server will be spawned as a child process of the editor/client, there is no easy way to view it.
* The process id is different each time, it is not easy to just attach a debugger to the server.
* VSCode requires building an extension just to test a language server: [https://stackoverflow.com/questions/46029346/can-i-test-my-lsp-server-without-writing-an-extension](https://stackoverflow.com/questions/46029346/can-i-test-my-lsp-server-without-writing-an-extension).

My recommendation is to just use a different editor during development.
OG Vim, NeoVim, Zed, whatever.
Ironically, they are all easier to configure compared to VSCode.

For debugging, I used a client/server model which is documented [here](https://github.com/bullno1/buxn-ls?tab=readme-ov-file#what-are-modes).

First, create a socket server.
Whenever there is a connection, it spawns a separate language server instance.
This server instance communicates with the client through this connection as if it is stdio.
Whenever we make a new build of the language server, this is what we launch.

Then, create a proxy/shim.
It first connects to the socket server, then it proxies between stdio and the socket connection.
The editor/client is configured to start this proxy instead.

The setup look like this:

```txt
          stdio             socket
Editor <---------> Shim <-----------> Language Server
```

This allows us to:

* Easily view the debug log since the logs are now in the server process, not obscured by the editor.
* Start the language server with a debugger attached.
  We no longer have to hunt for the process ID.
  Problems can be debugged immediately.

This does require being able to abstract the underlying transport stream so that the same server code works seamlessly between socket and stdio.
As the higher level code mostly deal with JSON-RPC message instead of character stream, this should not be a problem.

In my project, all the 3 modes (stdio, shim, server) are in the same executable and they can be switched with a CLI argument but you can also just create separate executables.

# Initialization and shutdown

The first message must come from the client: [initialize](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialize).
It lets the client and the server negotiate capabilities (i.e: Which features are supported).
The protocol has a lot of features but not all of them need to be implemented at once.
After the server has responded to this message, it must wait for the [initialized](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialized) notification from the client.

Since there is a fixed initialization sequence, the server code should be structured to something like this:

```c
// Wait for inititalize request
msg_t init_msg = wait_for_initialize();
send_initialize_response(response);

// Wait for inititalized notification
wait_for_initialized();

// Enter message loop
while (true) {
    msg_t msg = wait_for_message();

    if (message_is_shutdown(&msg)) { break; }
    handle_msg(msg);
}

// Clean up
```

Shutdown is similar:

1. The client sends a [shutdown](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#shutdown) request.
2. The server responds to that.
3. The client sends an [exit](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#exit) notification and actually exits.

I guess this helps the server to distinguish between the connection being closed due to an error and an orderly shutdown.

## Which capabilities to return?

It's easy to get lost while reading the spec beyond this point.
For now, this is the only thing we need to return to the client:

```json
{
  "capabilities": {
    "textDocumentSync": {
      "openClose": true,
      "change": 1
    }
  }
}
```

Also, ignore everything that mentions `dynamicRegistration`.
That is just unnecessary complications in the protocol.

# Feature: Document synchronization

This is the first thing that needs to be implemented.
The editor deals with documents which are in the process of being edited but not yet saved to disk.
Still, it wants the language server to help with things like diagnostic or auto-completion.

The client does this by sending [synchronization notifications](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_synchronization) to the server so that the server can see the same documents as the editor.
The following should be handled:

* [`textDocument/didOpen`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didOpen)
* [`textDocument/didChange`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didChange)
* [`textDocument/didClose`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didClose)

Between `textDocument/didOpen` and `textDocument/didClose`, the document should not be read from disk since its "canonical" content lies entirely in the editor.
For now, we set `capabilities.textDocumentSync.change` to `1` which corresponds to [`TextDocumentSyncKind.Full`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentSyncKind).
This means the client will have to send us the full document every time it makes a change.
This is inefficient but simple to implement at first.

Because we cannot rely on disk content, these documents should be cached in an associative map:

* `textDocument/didOpen` adds the document to the map
* `textDocument/didChange` updates the map
* `textDocument/didClose` removes the document from the map

Document versioning can also be ignored at this stage as only the editor makes changes.

This brings us to the next question: what should the key of this map be?

## Document identity, workspace and root path

LSP uses [URI](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#uri) to identify documents.
However, most filesystems that I know of do not.

In my language server, the key of this associative map is the relative path from the root project directory.
The [initialize](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialize) message tells us about the root path of the project in `workspaceFolders` so this can be calculated.

This is where you need to apply your own judgement based on your language.
Some languages may have a "project file" to configure import/include directories.
Some allow system wide search for modules...
Storing URI or absolute path might be a better choice in those.
Whatever it is, be consistent as this path has to be unique.

# Feature: Live diagnostic

Now that we have a partial map of the project files.
The next step is to jump straight into [diagnostic](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_publishDiagnostics).
Run your parser/compiler/linter/analyzer/whatever... on the documents in the project whenever `textDocument/didOpen` or `textDocument/didChange` is received.
If you find an error or warning, push it to the client.

Do take note that since this is based on push, if a document later becomes free of errors, an empty notification needs to be sent.
In my project, I keep a list of files visited by the analyzer.
In the next run, if a file is no longer visited (since it is not imported anymore), the language server still pushes an empty diagnostic notification to clear the document.

Congratulations, you have built a functional language server!
Or may be not.

## Implementation considerations
### Position encoding

This is perhaps your first hurdle.
You need to point out that an error happens at line 6, column 9 but how?
LSP uses a bizarre [position encoding scheme](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocuments).

Not all clients support UTF-8 position encoding yet so we'd have to deal with UTF-16.
This is a consequence of VsCode being written in Typescript.
Still, such implementation details should never have leaked into the protocol layer in the first place.

If your parser is written naively (read text char by char), chances are, it is already UTF-8 compatible without any further work.
You'd need to implement 2 functions:

* One to convert from UTF-8/byte offset to UTF-16 code unit offset.
* One to convert from UTF-16 code unit offset to UTF-8/byte offset.

If your language somehow already supports UTF-16 internally, good for you, please reconsider your life choices.
Otherwise, consult your language manual/ecosystem for text encoding conversion functions.

For my project, I have implemented [these](https://github.com/bullno1/buxn-ls/blob/d9b492aae7fdbe3e6d7fdf30040bf0ad92fe87f5/src/lsp.c#L243-L295) with the help of the excellent [utf8proc](https://juliastrings.github.io/utf8proc/) library.

Splitting a file into lines is also a task that is frequently needed.
The split content should be cached instead of doing it to the file every time.

### Virtual filesystem

If you implement your own language backend (parser, compiler...), a virtual filesystem is highly beneficial.
That is to say: The backend should not directly call `fopen`/`open`/`CreateFile` whenever it needs to open a file.
Instead, it should make calls to a filesystem abstraction layer.

A language server has to deal with both files being edited by the editor and files lying on disk.
If your language supports any form of "import", there will be import arcs that cross the boundary between the two.

The virtual filesystem should always check the [document sync cache](#feature-document-synchronization) first.
Only when a file is not there, it would load from the underlying filesystem.
This would allow a seamless experience for the user where they can edit one file and immediately see changes being reflected in dependent files without saving.

### Structured error reporting

The language backend should support structured error reporting instead of just spitting out lines of text to the stderr or a stream.

There should be a programmatic API where the caller can plug in a listener to listen for errors and warnings as structured messages.
In my project, the assembler sends `buxn_asm_report_t` structs defined as follow:

```c
typedef struct {
    int line;
    int col;
    int byte;  // This will be explained later
} buxn_asm_file_pos_t;

typedef struct {
    buxn_asm_file_pos_t start;
    buxn_asm_file_pos_t end;
} buxn_asm_file_range_t;

typedef struct {
    const char* filename;
    buxn_asm_file_range_t range;
} buxn_asm_source_region_t;

typedef enum {
    BUXN_ASM_REPORT_ERROR,
    BUXN_ASM_REPORT_WARNING,
} buxn_asm_report_type_t;

typedef struct {
    const char* message;
    const char* token;
    const buxn_asm_source_region_t* region;

    const char* related_message;
    const buxn_asm_source_region_t* related_region;
} buxn_asm_report_t;
```

### Dependency graph

If your language supports importing modules, consider building a dependency graph between files/modules as you run your analysis.
This structure will be utilized later but even at this stage, there are potentially several applications.

When the language server knows that module `A` imports module `B`, it can cascade changes from `B` into `A`.
In languages like C where there is a preprocessor for including files, the language server can choose to do the opposite.
Whenever `B` changes, instead of running the analyzer on `B`, run on all the "root" files that include `B` either directly or transitively.

### Debouncing

The editor can send repeated change notifications.
It might be worth considering a debounced approach when the language server wait for a period of no changes before running an analysis pass.

# Feature: Symbol listing

The next step is symbol listing (aka [this view](https://code.visualstudio.com/updates/v1_25#_outline-view)).
Add the following to the capability list:

```json
{
  "capabilities": {
    "documentSymbolProvider": true,
    "workspaceSymbolProvider": {
      "resolveProvider": false
    }
  }
}
```

The two requests to be handled are:

* [`textDocument/documentSymbol`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol)
* [`workspace/symbol`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol)

They are pretty similar.
One lists symbols in a single document.
The other lists and filters symbol at workspace level.

During the analysis/diagnostic pass, the language server should also collect symbols from the project.
To facilitate  `textDocument/documentSymbol`, each source/module node in the [dependency graph](#dependency-graph) should store a list of symbols defined in that file.
For global listing/filtering, either create a shared list or simply iterate through all modules.

## Implementation considerations

This feature is surprisingly missing/unexposed from a lot of language backends.
My own implementation of uxntal has to create a debug info file so symbol names and their locations are already reported.

Just like [structured error reporting](#structured-error-reporting), consider providing a hook into the compilation process to extract this data.

I did not implement `capabilities.workspaceSymbolProvider.resolveProvider`.
Hence, it is set to `false`.
In LSP, whenever `resolveProvider` is mentioned, it means the server can return a partial response.
It is supposed to be easier to compute than the full response.
Then, only if the client is interested in a particular item in the list, it would call the related resolve method (e.g: `workspaceSymbol/resolve`) to get the full response.
In my case, uxntal is a very simple language where I can afford to call the compiler (or rather, assembler) all the time.
All the language server does is hook into the assembler and extract relevant data.
There was never an instance where a `resolveProvider` would have been useful but YMMV.

# Feature: Goto definition

The next feature is "go to definition" and its inverse: "find references".
Add the following capabilities:

```json
{
  "capabilities": {
    "definitionProvider": true,
    "referencesProvider": true
  }
}
```

We would have to handle the following requests:

* [`textDocument/definition`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_definition)
* [`textDocument/references`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_references)

Function calls, variable references, imports...
All of those are instances of references to definitions.
This is the first time I have to modify the compiler for the language server.
While it obviously handles the above constructs, they were never reported to the frontend as they were deemed to be too low level.

Beyond `textDocument/definition`, there are also: `textDocument/declaration`,`textDocument/typeDefinition` and `textDocument/implementation` which only make sense in some languages.

## Implementation considerations
### Reference graph

Both methods can be implemented by building a reference graph during the analysis/diagnostic run.
In the previously constructed [dependency graph](#dependency-graph), we already stored a list of symbols in each source node to assist [symbol listing](#symbol-listing).
For this feature, also create edges between references and definitions.

In my implementation, definitions of different constructs are stored in a single list.
Then there is a separate list of references.
Edges are drawn between nodes in the two lists.

### Position encoding

Both method take a [`TextDocumentPositionParam`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentPositionParams) as input.
We have dealt with LSP's position encoding earlier so the conversion functions can be reused here. 

It might also be beneficial to just pre-convert or cache all position data for each node (reference or definition) in LSP's format (UTF-16).
This would allow the language server to quickly respond to a request without further calculation.

Since the lookup is localized to a single document, a linear search is usually fast enough.

### Bonus feature: Hover

[`textDocument/hover`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_hover) can be easily implemented given that symbol ranges are already recorded for this feature.
When a reference is hovered over, the language server can return where it is defined.

Don't forget to add: `"hoverProvider": true` to capabilities.

# Feature: Auto-complete

The number one feature of a language server is saved for last as it is the most involved.
First, add the capability:

```jsonc
{
  "capabilities": {
    "completionProvider": {
      "triggerCharacters": [
        // Replace with your own
        "/",
        ".", "-",
        ",", "_",
        "&"
      ],
      // Replace with your own
      "allCommitCharacters": [ " " ],
      "resolveProvider": false
   }
}
```

The method to be implemented is: [`textDocument/completion`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion).

There are a lot to read here but the main things to look at are:

* The request type: [`CompletionParams`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionParams).
  This is the old [`TextDocumentPositionParams`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentPositionParams) we are already familiar with, augmented with some extra data that can be ignored initially.
* The response type: [`CompletionList`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionList).
  With the bulk of it being an array of [`CompletionItem`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionItem).

The short version is that either through typing a character in `capabilities.completionProvider.triggerCharacters` or pressing a key combination (e.g: "Ctrl+Space"), `textDocument/completion` will be sent to ask for completion candidates.

The implementation details are largely language-dependent.
However, the following should apply to many languages:

* The editor knows nothing about the language or concepts such as symbol/identifier boundaries.
  Understand that all it does is sending the cursor position and ask for help.
* We created a function to convert from UTF-16 offset to byte offset.
  It can be used to extract the token being edited from the source code.
  In my implementation, since there is no multiline tokens, I just have to:

  1. Find the source line.
     The file is already split into lines in order to support previous features.
  2. From the cursor position, scan backward until we hit the beginning of the line or a white space.
  3. The text between the position in step 2 and the cursor is the "completion context" token.
* Since this token is in the process of being edited, we cannot fully rely on it and treat it like a "go to definition" request.
  What we can do is making use of existing surrounding context:

  * What symbols are defined before this token?
  * If the language allows use before definition, what symbols are defined after?
  * If the language has transitive symbol importing, the dependency graph would come in handy.
    Recursively search all imported files for candidates too.
* The token can also be used to create a prefix filter that further shortens the candidate list.
* Also take note of scoping rule and shadowing rule.
  Thanks to previous features, all symbols nodes are already stored with location data which should help with determining the scope of the completion context token.

## Implementation considerations
### Error tolerance

During editing, the document would become momentarily invalid.
It would be annoying to have symbols being invalidated as a result of that.
The common advice is to be able to continue parsing/processing despite errors.
There are some problems with this:

* It is often easier said than done.
* Continuing after an error can lead to a cascade of errors, creating too much noise in the diagnostic.

There is a strategy I found that is simple to implement but offer reasonable error tolerance:

* Make the analyzer stop early when there is a syntax (not semantic or reference) error.
* Keep two versions of the dependency&reference graph we constructed earlier, one "current" and one "previous".
* During analysis, for each source node that contains any errors, check its corresponding "previous" version.
* Copy all symbols from the "previous" version which are defined after the error to the "current" version.
  Alternatively, copy all "previous" symbols whose source positions are greater than all other "current" symbols.

Here's an example.
Suppose that we have this error-free source code:

```c
int foo = 1;
int bar = 2;
int baz = foo;
```

There are 3 symbols (variables): `foo`, `bar`, `baz`.
The user starts editting and creates an error:

```c
int foo =   // No terminator
int bar = 2;
int baz = foo;
```

The parser only recognizes `foo` being defined but ignore the other 2 due to the erroneous declaration.
With the above strategy, since `bar` and `baz` are declared after `foo`, their definitions from the previous run are copied into the current run.
Suppose that the user now does this:

```c
int foo =   // Still an error
int bar = 2;
int baz = b // Press Ctrl+Space
```

The completer would now search for all preceding symbols whose names start with `b` and would still find `bar` since it was copied over.

Blindly copying symbols over is like this not precise. 
However, in the presence of localized errors, it offers a way to preserve the already defined symbols for the purpose of auto completion.

### Send `textEdit` for consistent behaviour

Instead of just sending `CompletionItem.label`, consider sending `CompletionItem.textEdit` too.
This helps to deal with ambiguity when the user/editor is resuming a partial completion.
For example: `object.f<Ctrl + space>` should list all fields in `object` starting with `f`.
But the displayed label should be: `field_name` instead of `ield_name`.

### Grouping symbols

For languages that have certain forms of modules/packages/namespaces, when the completion prefix matches a namespace, usually all symbols within that namespace are candidates.
But this can be overwhelming and noisy to look at.
In such cases, it can be helpful to just return a single entry that represents the entire namespace with a description like `(X symbols)`.
Then, only when it is chosen, expand to more symbols.

### Parsing annotation

The `detail` and `documentation` fields should be filled if possible.
In many languages, documentations are actually comments.
They can be silently dropped by the parser before even passing to the compiler.
This is another place where the compiler might have to be updated.

For my language server, I built a simple annotation parser that returns the start and end byte offset of doc comments.
When it is time to display the doc, the file content is simply "sliced":

```c
// Find the file
buxn_ls_file_t* file = buxn_ls_find_file(analyzer, region->filename);
if (file == NULL) {
    return (buxn_ls_str_t){ 0 };
} else {
    return (buxn_ls_str_t){
        .chars = file->content.chars + region->range.start.byte,
        .len = region->range.end.byte - region->range.start.byte,
    };
}

// buxn_ls_str_t is defined as
typedef struct {
    const char* chars;
    size_t len;
} buxn_ls_str_t;
```

Internally, I store all source positions as 0-based byte offset from the beginning of the file [^3].
This allows for quickly quoting certain parts of the text: documentation, annotation, errorneous token, even rendering caret diagnostics.
line and column numbers are only there for a more user friendly message.
They are also useful when dealing with LSP.

# Conclusion

At this point, you already have a quite functional language server [^4].
There are still other features to explore:

* [Syntax/semantic directed folding](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_foldingRange)
* [Quickfix/Refactor](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#codeActionKind)
* And more: [https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#languageFeatures](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#languageFeatures)

Once the initial structure is settled, it is easy to iterate and add new features.
I hope this guide helps you get over the initial hurdles of implementing your own language server.
Now go out there and serve some languages.

---

[^1]: This should be the subject of another post after the project is better documented.
[^2]: The [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/) (DAP) has a similar design.
[^3]: [https://www.computerenhance.com/p/byte-positions-are-better-than-line](https://www.computerenhance.com/p/byte-positions-are-better-than-line)
[^4]: Ship it.
