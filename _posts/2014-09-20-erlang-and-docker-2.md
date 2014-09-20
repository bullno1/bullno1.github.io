---
layout: post
title: Erlang and Docker - Part 1 - Part 1 doesn't need a subtitle
---

See [part 0] [1] here on why I decided to do this.
This blog post assumes that you already have some familiarity with Erlang/OTP and Docker.
To follow this article, clone [cowdock] [2].

First, make sure that everything works, build the release with:

```sh
make
make release
```

Try running the release with `_rel/cowdock/bin/cowdock foreground` and point your browser to [http://localhost:8080](http://localhost:8080).
Now that we have created a release, the next step is to figure out its runtime dependencies.
For that, we use [ldd] [3]:

```sh
% ldd _rel/cowdock/erts-6.1.2/bin/*

/usr/lib/erlang/erts-6.2/bin/beam:
	linux-vdso.so.1 (0x00007fff5ea90000)
	libdl.so.2 => /usr/lib/libdl.so.2 (0x00007fd86bb68000)
	libm.so.6 => /usr/lib/libm.so.6 (0x00007fd86b863000)
	libncursesw.so.5 => /usr/lib/libncursesw.so.5 (0x00007fd86b5fe000)
	libz.so.1 => /usr/lib/libz.so.1 (0x00007fd86b3e8000)
	libpthread.so.0 => /usr/lib/libpthread.so.0 (0x00007fd86b1cc000)
	librt.so.1 => /usr/lib/librt.so.1 (0x00007fd86afc4000)
	libc.so.6 => /usr/lib/libc.so.6 (0x00007fd86ac21000)
	/lib64/ld-linux-x86-64.so.2 (0x00007fd86bd6c000)
/usr/lib/erlang/erts-6.2/bin/beam.smp:
	(output truncated)
```

Hmm, `linux-vdso.so`, `libdl.so`, `libpthread.so`... nothing unusual here, all are provided by the `glibc` package [^1].
Two entries stand out: `libz.so.1` and `libncursesw.so`. The former is zlib and is used for compression.
I don't think it is optional.
`stdlib` has a zip module which is loaded on start-up.
`release_handler` has a function called `untar_release`.
However, a quick search for "erlang zlib" gives us a link to the [build instruction page] [4], which contains:

> --{enable,disable}-builtin-zlib - Use the built-in source for zlib.

This means Erlang can be built with zlib statically linked.
Similarly, searching for "erlang ncurses" gives a link to the [mailing list] [5], which contains:

> Erlang uses ncurses in the terminal driver for the so called new shell.
> http://github.com/erlang/otp/blob/pu/erts/emulator/drivers/unix/ttsl\_drv.c

> It is also possible to build an Erlang ersion which does not use
> term\_cap with the configure option

> Some of the available configure options are:
>
>> --{with,without}-termcap: termcap (without implies that only the old
>> Erlang shell can be used)
>

This means we can totally get rid of `ncurses` [^2].
However, building Erlang is a tedious task.
And then there's also a problem with having multiple versions on the same machine.
Luckily, a fine gentleman has created [erln8] [6].
It's a tool which helps building Erlang with different configuration and easily switching between different versions.
Let's setup erln8:


```sh
# If you have Erlang in /usr/local/bin, this will overwrite it
git clone https://github.com/metadave/erln8.git
cd erln8
make
sudo make install

# Initial setup
erln8 --init
erln8 --clone default
```

To setup erln8 to build our customized Erlang version, open `~/.erln8.d/config` in a text editor and add the following ~~ridiculously long~~ line under the `[Configs]` section:

	min=--without-termcap --enable-builtin-zlib --without-hipe --disable-hipe --without-orber --without-ic --without-cosEvent --without-cosEventDomain --without-cosFileTransfer --without-cosNotification --without-cosProperty --without-cosTime --without-cosTransactions --without-snmp --without-megaco --without-wx --without-otp_mibs --without-ssh --without-ose --without-ct --without-eunit --without-webtools --without-observer --without-dialyzer --without-odbc --without-os_mon --without-asn1 --without-diameter --without-eldap --without-gs --without-jinterface --without-et --without-edoc --without-erl_docgen --without-debugger

`--without-termcap` get rids of the `ncurses` dependency.
`--enable-builtin-zlib` get rid of `zlib` dependency.
Other than that, other applications are disabled to save build time and they are not needed for this example.
You can always build a more completed version if needed.
Let's build this customized and stripped down version:

```sh
erln8 --build --tag OTP-17.1.2 --id OTP-17.1.2-min --config=min
```

Now is the time for a commercial break. stay tune, we'll be back after it finishes building.

<iframe width="420" height="315" src="//www.youtube.com/embed/rRbY3TMUcgQ" frameborder="0" allowfullscreen></iframe>

To config erln8 to use this version, all we need is an `erln8.config` file with the following content:

```cfg
[Config]
Erlang=OTP-17.1.2-min
```

Everytime we cd into that folder or its subfolder, `erl` will invoke the corresponding version.
Let's rebuild the release:

```sh
make clean
make
make release
```

Did we get rid of some dependencies?

```sh
% ldd _rel/cowdock/erts-6.1.2/bin/*

_rel/cowdock/erts-6.1.2/bin/beam:
	linux-vdso.so.1 (0x00007fff417fc000)
	libutil.so.1 => /usr/lib/libutil.so.1 (0x00007f8d10c6c000)
	libdl.so.2 => /usr/lib/libdl.so.2 (0x00007f8d10a68000)
	libm.so.6 => /usr/lib/libm.so.6 (0x00007f8d10763000)
	libpthread.so.0 => /usr/lib/libpthread.so.0 (0x00007f8d10547000)
	librt.so.1 => /usr/lib/librt.so.1 (0x00007f8d1033f000)
	libc.so.6 => /usr/lib/libc.so.6 (0x00007f8d0ff9c000)
	/lib64/ld-linux-x86-64.so.2 (0x00007f8d10e6f000)
_rel/cowdock/erts-6.1.2/bin/beam.smp:
	(output truncated)
```

Yep, they're gone.
Let's get to the main part: building a docker base image and our app image.

ArchLinux includes a program called `pacstrap` which allows one to create a base installation of ArchLinux in another mounted device or folder [^3].
This is perfect! `pacstrap` is provided with the `arch-install-scripts` package.
Let's go through the package that we need:

* Erlang uses shell script for its boot up sequence so we need a shell and some common utilities like `basename`, `which`...
  Those are quite heavy so let's use `busybox` instead.
* `glibc` since the emulator is written in C after all.
* `openssl`: `crypto` depends on it and `cowboy` depends on `crypto` and we are using `cowboy`.
  It's not listed by `ldd` because it's loaded dynamically when `crypto` starts.
  It's not a dependency of the runtime system anyway.

With that, we can create the root filesystem for our image:

```sh
mkdir rootfs
sudo pacstrap -c -d rootfs busybox glibc openssl

# Don't stay as root for too long
sudo sh -c 'chown -R $SUDO\_USER:users rootfs'

cd rootfs
# Install busybox applets
bin/busybox --list | while read cmd
do
	ln -s /bin/busybox bin/$cmd
done
```

Let's check out how lightweight our minimal installation is:

```sh
% du -hs rootfs

154M    rootfs
```

![Vader](http://www.noooooo.info/darthvadernooo.jpg)

All our efforts for nothing?
Let's see what's wrong with this environment:

```sh
du -hc rootfs | sort -h
```

Something uneeded stuff here:

* perl: What is perl even doing here? Turn's out it's [not needed at all] [7]
* man and info pages: Who needs them when you have [bro] [8]?
* pacman package database: We are not going to install any new packages anyway.
* include headers and static libraries: We don't need to compile code here.
* keymap, locales, localization and time zone info: [nuff said] [9]. Let's get rid of the extras.

It's time to:

![DeleteAllTheThings] (https://i.chzbgr.com/maxW500/5100889856/h9E0B010A/)

```sh
sudo pacman --root `pwd`/rootfs --noconfirm -Rdds perl
rm -rf usr/share/man
rm -rf var/lib/pacman
rm -rf usr/share/doc
rm -rf usr/include
rm -rf usr/share/info
rm -rf etc/pacman.d
find usr/lib/gconv -type f -and -name '*.so' \
                           -and ! -name ANSI_X3.110.so \
                           -and ! -name UNICODE.so \
                   -exec rm {} \;
rm usr/lib/*.a
rm usr/lib/*.o
find usr/share/i18n/charmaps -type f -and ! -name ANSI_X3.110-1983.gz \
                                     -and ! -name UTF-8.gz \
                             -exec rm {} \;
find usr/share/i18n/locales -type f -and ! -name 'translit_*' \
                                    -and ! -name en_US \
                            -exec rm {} \;
find usr/share/zoneinfo -type f -and ! -name UTC \
                                -and ! -name '*.tab' \
                        -exec rm -rf {} \;
find usr/share/zoneinfo -type d -empty -delete
find var/cache -type f -delete
rm -rf var/log/*
rm -rf usr/share/iana-etc #doesnt look that important
rm -rf usr/share/locale #en_US is not using it
```

*hold breath*. Let's check how big this thing is again:

```sh
% du -hs rootfs

14M    rootfs
```

It could be smaller if we are more aggressive in deleting libraries in `/usr/lib` but I'm playing safe here.
For now, it's close enough to being small.
All that's left is to build a docker image with some automation.

`Makefile`:

```make
.PHONY: all

all: docker/rootfs.tar.gz
		docker build docker

docker/rootfs.tar.gz: mk-rootfs.sh
		./mk-rootfs.sh
```

`docker/Dockerfile`:

	FROM scratch
	MAINTAINER Bach Le
	ADD rootfs.tar.gz/ /

`make` will buid everything. All that's left is to tag the image with `docker tag`.

Let's get back to `cowdock`.
We need a `Dockerfile` to build an image for this app.
It's quite self-explanatory:

	FROM bullno1/archerl
	MAINTAINER Bach Le
	EXPOSE 8080
	ENTRYPOINT ["/opt/cowdock/bin/cowdock"]
	CMD ["foreground"]
	ADD release.tar.gz /opt/cowdock

`release.tar.gz` is a compressed archive of our release.
Building the image is done in a separate sub-folder with compressed files to minimize the amount of data sent to the daemon and save time.
The whole process is automated using the following make rules:

```make
.PHONY: docker-image

docker-image: docker/release.tar.gz
	docker build docker

docker/release.tar.gz: release
	cd _rel/cowdock && tar -czf ../../docker/release.tar.gz *
```

Just type `make docker-image` and everything will be taken care of.
`docker tag` the image as `bullno1/cowdock` and run it with:

```sh
docker run --rm -P bullno1/cowdock
```

Woohoo!! It works!
Now you can find out the port it was assigned with `docker ps` and point your browser to that.

See the "Hello world" message?
Here's a programmer Ryan Gosling picture for absolutely no reason:

![RyanGoslingHelloWorld](http://24.media.tumblr.com/tumblr_lx8o9am9OK1r8lg7to1_500.jpg)

And that's it.
Feel free to use `bullno1/archerl` for your apps.
Tell me if you can reduce its size further and still keep Erlang running.

[1]: /erlang-and-docker
[2]: https://github.com/bullno1/cowdock
[3]: http://en.wikipedia.org/wiki/Ldd_(Unix)
[4]: http://www.erlang.org/doc/installation_guide/INSTALL.html
[5]: http://erlang.org/pipermail/erlang-questions/2010-March/049995.html
[6]: https://github.com/metadave/erln8
[7]: https://bugs.archlinux.org/task/14903
[8]: http://bropages.org/
[9]: http://images2.layoutsparks.com/1/103128/pulp-fiction-english-mother.gif

[^1]: To figure out which package provides a given library under ArchLinux, use `pkgfile`, other distros should have similar utilities.
[^2]: Old style shell is functional but unpleasant to work with. However, there are ways to get around it. This will be addressed in future posts.
[^3]: The build script will use vagrant to build if Arch Linux is not the host operating system. This is done automatically.
