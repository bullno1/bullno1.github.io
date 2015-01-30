---
title: S.O.S.E
description: Realtime multiplayer battleship with explosions
thumbnail: /projects/images/sose2.png
---

<iframe width="560" height="315" src="https://www.youtube.com/embed/E2jbcrgUpfQ" frameborder="0" allowfullscreen></iframe>

# Introduction

Symphony of space explosions (S.O.S.E) is a multiplayer real-time strategy game.
It was developed as an academic project for the modules CS3283 & CS3284 (Media Technology Project).

It is similar to the board game [Battleship] [1] with a few twists.
The game is played in real-time, players to have gather resources construct buildings and weapons just like a normal RTS game.
However, they conduct  their activities in separate floating islands and attack each other by sending missiles and robots towards the opponent's base much like a game of Battleship.

# My role and contributions in the project

I was the lead programmer in a team of 4 students.
My main contributions were:

- Creating a framework for a networked RTS game using lockstep, bucketed synchronization.
- Creating a framework for hot reloading of assets and scripts.
- Program some of the basic units' behaviours.

# Technology and tools used

- Moai engine: http://getmoai.com/
- C/C++ for creating a customized [Moai host] [2]
- [Lua] [3] for gameplay programming
- Visual Studio 2010 for C/C++ development
- Vim for script editing
- git

# Source code

Available at: https://github.com/jarbology/SOSE

# Screenshots

![SOSE1](/projects/images/sose.png)
Title screen

![SOSE2](/projects/images/sose2.png)
A player is attacking his enemy's base which is still covered with fog of war

![SOSE3](/projects/images/sose3.png)
Buildings can be created from a ring menu which reduces unnecessary mouse movement

[1]: http://en.wikipedia.org/wiki/Battleship_%28game%29
[2]: http://getmoai.com/wiki/index.php?title=Moai_Hosts
[3]: http://www.lua.org/
