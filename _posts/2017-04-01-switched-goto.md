---
title: Faster portable bytecode interpreter with switched goto
---

_Processors hate him, learn to write faster portable interpreters with this simple trick._

tl;dr: In this post, I will talk about a bytecode interpretation technique which performs better than switch dispatch while remaining portable.

# A tale of two dispatch techniques

When it comes to building a bytecode interpreter in C, one usually have two choices: a giant switch or computed goto [^1].
Suppose that your virtual machine instruction is defined as follow:

```c
enum opcode_e {
	OP_ADD,
	OP_LOAD_INT,
	OP_JMP,
	// And many more
};

struct instruction_s {
	enum opcode_e opcode;
	int operand;	
};
```

Using switch dispatch, this is how the interpreter loop would look like:

```c
struct instruction_s* ip = array_of_bytecode;

while(true)
{
	switch((*ip++).opcode)
	{
		case OP_ADD:
			// Do add
			break;
		case OP_JMP:
			// Set ip to target
			break;
		// ...
	}
}
```

With computed goto, specifically, indirect-threading, the loop would look like this:

```c
struct instruction_s* ip = array_of_bytecode;

void* labels[] = { &&lbl_ADD, &&lbl_LOAD_INT, &&lbl_JMP, /* ... */ };

goto labels[(*ip++).opcode]; // Jump to the first opcode body

lbl_ADD:
	// Do add
	goto labels[(*ip++).opcode]; // Jump to next opcode body

lbl_JMP:
	// Set ip
	goto labels[(*ip++).opcode]; // Jump to next opcode body

// ...
```

Switch-based dispatch is portable since it only uses standard feature in the C language.
Indirect-threading using computed goto is generally faster.
The simple and short explanation is that switch-based dispatch consists of a single indirect branch (the switch statement) and multiple targets (case statements) while computed goto has multiple branches and targets (goto statements and labels).

The former is bad for CPU branch predictors because all it sees is a single source randomly jumps to different targets, which is almost always unpredictable.
The later is better.
There is usually a correlation between instructions: a series of `OP_PUSH` is usually followed with an `OP_CALL`, an `OP_JOF` (jump on false) almost always comes after an `OP_CMP` (comparison).

One is faced with a dilemma: portability (switch) or performance (computed goto)?
While computed goto is supported in GCC and Clang which for some is "portable enough", my language, [lip](https://github.com/bullno1/lip) must be compiled on Microsoft Visual C++ (MSVC), a popular and **good** [^2] compiler on Windows.

# A naive solution

If a single branch creates problem for branch prediction, why don't we just replicate it?

```c
struct instruction_s* ip = array_of_bytecode;

switch((*ip++).opcode)
{
	case OP_ADD: goto lbl_ADD;
	case OP_LOAD_INT: goto lbl_LOAD_INT;
	case OP_JMP: goto lbl_JMP;
	// ...
}

lbl_ADD:
	// Do ADD
	// The same switch block as before
	switch((*ip++).opcode)
	{
		case OP_ADD: goto lbl_ADD;
		case OP_LOAD_INT: goto lbl_LOAD_INT;
		case OP_JMP: goto lbl_JMP;
		// ...
	}

lbl_LOAD_INT:
	// Do LOAD_INT
	// The same switch block as before
	switch((*ip++).opcode)
	{
		case OP_ADD: goto lbl_ADD;
		case OP_LOAD_INT: goto lbl_LOAD_INT;
		case OP_JMP: goto lbl_JMP;
		// ...
	}

lbl_JMP:
	// Do JMP
	// The same switch block as before
	switch((*ip++).opcode)
	{
		case OP_ADD: goto lbl_ADD;
		case OP_LOAD_INT: goto lbl_LOAD_INT;
		case OP_JMP: goto lbl_JMP;
		// ...
	}

// ...
```

While not strictly equivalent, each switch block functions similarly to a computed goto and lets the branch predictor exploit the correlation between VM instructions.
This would be faster than a single switch but also a pain to write.
Sure, we could define that switch block as a single macro but maintaining it as the VM is being developed, instructions getting added/removed/renamed is laborious and error-prone.

# X Macro to the rescue

There is a lesser-known technique in C called [X Macro](https://en.wikipedia.org/wiki/X_Macro) which can help.

Let's apply it to opcode definition:

```c
#define OPCODE(X) \
	X(OP_ADD) \
	X(OP_LOAD_INT) \
	X(OP_JMP) \
	// ...

#define DEFINE_ENUM(NAME, ENUMX) enum NAME { ENUMX(ENUM_ENTRY) }
#define ENUM_ENTRY(ENTRY) ENTRY,

DEFINE_ENUM(opcode_e, OPCODE);
```

First, we define a macro that takes in a parameter X, that macro applies X to all members of the `OPCODE` list.
Then we use it to define an `enum` whose members come from the opcode list.
`DEFINE_ENUM(opcode_e, OPCODE)` simply expands to:

```c
enum opcode_e { OP_ADD, OP_LOAD_INT, OP_JMP /* ... */ }
```

With X macro, we have gained the ability to do use (limited) higher order function in the C preprocessor!
One fairly obvious use is to generate a "to string" function for enums:

```c
#define DEFINE_TO_STRING(ENUM_NAME, ENUMX) \
	const char* CONCAT(ENUM_NAME, _to_string) (ENUM_NAME e) { \
		switch(e) { \
			ENUMX(ENUM_TO_STRING_CASE) \
		} \
	}

#define ENUM_TO_STRING_CASE(ENUM) \
	case ENUM: return STRINGIFY(ENUM);

#define CONCAT(X, Y) X##Y
#define STRINGIFY(X) #X
```

`DEFINE_TO_STRING(opcode_e, OPCODE)` would expand to a function named `opcode_e_to_string` that accepts an `opcode_e` and returns a string version of it.

We can use X Macro to generate the giant opcode dispatch switch block:

```c
#define DISPATCH() switch((*ip++).opcode) { OPCODE(DISPATCH_CASE) }
#define DISPATCH_CASE(OP) case OP: goto CONCAT(lbl_, OP);
```

It's that simple!
Now the dispatch loop becomes:

```c
DISPATCH();

lbl_OP_ADD:
	// Do ADD
	DISPATCH();

lbl_OP_LOAD_INT:
	// Do LOAD_INT
	DISPATCH();

lbl_OP_JMP:
	// Do JMP
	DISPATCH();

// ...
```

It's easy to maintain and fast!

# And his name is ...

For a lack of a better name, I would like to call this technique "switched goto".
I have done some micro-benchmarks and the speed of switched goto is between that of single switch and computed goto while being pretty close to computed goto.

I am definitely not the first one to discover this as I recall reading in a mailing list about replicating the switch block to help branch prediction but the author did not give it a name or suggest how one would maintain that code.
Most literatures that I'm aware of only talk about switch threading, direct and indirect threading (both using computed goto) and sometimes call threading but not this.
It's a reasonably performant and completely portable technique that I would like to see being used more often.

[^1]: There is also assembly but that can't really be called C anyway.
[^2]: I don't get the hate for MSVC. From MSVC 2005/2008 onwards, it is really standard compliant.
