var members = fetch("https://firebasestorage.googleapis.com/v0/b/hebg-e2b7c.appspot.com/o/members.json?alt=media&token=ed61964b-e1da-47da-8dcd-7a3bbda15606")
	.then(function(resp) { return resp.json() });
var analysis = fetch("https://firebasestorage.googleapis.com/v0/b/hebg-e2b7c.appspot.com/o/analysis.json?alt=media&token=cf32d84c-ace5-428a-9119-1695e408779a")
	.then(function(resp) { return resp.json() });

Promise.all([members, analysis])
	.then(function(results) {
		var members = {};
		for(var idx in results[0]) {
			var entry = results[0][idx];
			members[entry.bgg_username] = entry;
		}
		console.log(members);
		var analysis = results[1];

		$p(document.body).render({
			members: members,
			analysis: analysis,
		}, {
			"#most-wanted-list > li": {
				"game<-analysis.most_wanted": {
					".game-link": function(params) {
						var master_list = params.context.analysis.master_list;
						var game = params.context.analysis.master_list[this.game_id];
						return game.name;
					},
					".game-link@href+": function(params) {
						var master_list = params.context.analysis.master_list;
						var game = params.context.analysis.master_list[this.game_id];
						return game.id;
					},
					".wanted-by-list > li": {
						"entry<-game.wanted_by": {
							"a": function(params) {
								var member = params.context.members[this];
								return member.name;
							},
							"a@href+": "entry",
						}
					},
					".possible-hosts-list > li": {
						"entry<-game.owned_by": {
							"a": function(params) {
								var member = params.context.members[this];
								return member.name;
							},
							"a@href+": "entry",
						}
					}
				},
			},
			"#all-games-list > li": {
				"game<-analysis.master_list": {
					"a": "game.name",
					"a@href+": "game.id",
				},
			},
			"#members-list > li": {
				"member<-members": {
					"a": "member.name",
					"a@href+": "member.bgg_username",
				}
			}
		});
	});
