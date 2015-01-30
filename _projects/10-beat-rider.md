---
title: Beat rider
description: Prototype for a music game with level generated from player's music library
thumbnail: /projects/images/beat-rider.jpg
---

# Introduction

Beat rider is a music game where the game levels are generated from the player's music library.
I contributed to this project during my time in [Rubycell Entertainment] [1] (2014).

At the stage it is currently presented, it is only a prototype to show the capability of the audio analysis system.
Other vastly different modes of play are possible.

# My role and contributions

- Research audio analysis methods and libraries
- Develop a graph-based audio processing framework which can be used from Lua scripts
- A prototype to demonstrates how raw numbers from the framework can be mapped to gameplay elements
- An [in-house build tool] [3] which eases the process of multi-platform building

# Technology and tools used

- Moai engine: http://getmoai.com/
- C/C++ for the audio processing [plugin] [2]
- Lua for scripting
- Vim as the text editor

# Screenshots

![beat-rider](/projects/images/beat-rider.jpg)
<div class="caption">A generated track can goes up and down as well as sideway</div>

![beat-rider-2](/projects/images/beat-rider2.jpg)
<div class="caption">In developer mode, audio features are visualized as graphs to help tuning game parameters</div>

[1]: http://rubycell.com/
[2]: https://github.com/moaiforge/moai-sdk/wiki/Using-Plugins
[3]: https://github.com/bullno1/easter
