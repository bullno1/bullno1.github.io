---
layout: post
title: Erlang and Docker - Part 0 - The beginning
---

Docker is all the rage these days.
I mean look at [this] [1].
That's 1/60th of [minecraft] [2].
So naturally, I decided to see what this is all about.

Basically, it allows you to pack your apps and all its dependencies in a common format to be deployed to The Cloud&trade;.
By using this feature in the Linux kernel called container, applications run with almost zero overhead.
It also provides isolation between apps.
They say it starts up pretty fast too.

I can see this being a big deal for languages like php or ruby which comes with a bunch of dependencies.
For Erlang, not so much.
Release handling means you already pack only what you need into a release.
Erlang developers don't ship their source code to servers.
We don't even have to install Erlang on the target machine!
Build once, run everywhere!
Take that, Java!

![TakeThat!](http://img-fotki.yandex.ru/get/9109/9777565.2c/0_6f33e_288795b9_orig)

Except that it's not entirely true.
Try making a release on ArchLinux or Ubuntu and run it on CentOS.
Be prepared for those missing shared library errors.
That's right, Erlang release can't even run across distros since it's dynamically linked by default and different distros handle libraries differently.
Just statically compiles everything then?
Easier said then done, have a look at [this] [3].
Currently I use [Vagrant] [4] whenever I need to "cross-compile".
VMs take a while to boot and customization/making your own image is intimidating.
Maybe it's time to look at an alternative.

For users, Docker is pretty simple really.
It lets you build and launch images.
The concept is pretty similar to vm images.
You take a base image like ubuntu or centos then you add your stuff on top of it.
And then you will have a 'lightweight' image ready to be sent to the ~~butt~~ cloud.

Wait a minute.

	% docker images

	REPOSITORY           TAG          IMAGE ID       CREATED             VIRTUAL SIZE
	centos               centos5      5a1ebaa356ff   8 days ago          484 MB
	centos               centos7      70214e5d0a90   12 days ago         224 MB
	centos               centos6      68eb857ffb51   12 days ago         212.7 MB
	base/archlinux       latest       dce0559daa1b   8 weeks ago         282.9 MB
	base                 latest       b750fe79269d   18 months ago       175.3 MB

That's right, you are sending the whole base OS _and_ your application everytime you deploy something [^1].
Some base images are smaller than other but popular distros are all in the 100MB+ range.

![Skeptical3rdWorldKid](http://i.imgur.com/DAJo1Vq.jpg)

Thus, I set on a quest to build a minimal base image to run Erlang releases.

For the impatient, checkout:

- [cowdock] [5] (the demo web app)
- [archerl] [6] (the base image).

A live demo of the combo in action can be found here: [http://cowdock-bullno1.beta.tutum.io:49154/](http://cowdock-bullno1.beta.tutum.io:49154/).

That's right, I spend my time making _portable_ 'Hello world' programs out of a programming language that nobody uses.

[1]: http://www.forbes.com/sites/benkepes/2014/09/16/the-rumors-were-true-docker-funding-confirmed-and-40-million-enters-the-coffers/
[2]: http://www.wired.com/2014/09/microsoft-minecraft-mobile/
[3]: http://stackoverflow.com/questions/6160677/how-to-statically-link-all-libraries-except-a-few-using-g
[4]: https://www.vagrantup.com/
[5]: https://github.com/bullno1/cowdock
[6]: https://github.com/bullno1/archerl

[^1]: I know that aufs can cache layers. But deploying to a fresh machine still takes an unnecessary amount of wait time.
