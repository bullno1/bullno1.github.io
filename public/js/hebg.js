var members = fetch("https://firebasestorage.googleapis.com/v0/b/hebg-e2b7c.appspot.com/o/members.json?alt=media&token=ed61964b-e1da-47da-8dcd-7a3bbda15606")
	.then(function(resp) { return resp.json() });
var analysis = fetch("https://firebasestorage.googleapis.com/v0/b/hebg-e2b7c.appspot.com/o/analysis.json?alt=media&token=cf32d84c-ace5-428a-9119-1695e408779a")
	.then(function(resp) { return resp.json() });

Promise.all([members, analysis])
	.then(function(results) {
		var members = results[0];
		var analysis = results[1];

		$p(document.body).render({
			members: members,
			analysis: analysis,
		}, {
			"#all-games-list": {
				"game<-analysis.master_list": {
					"a": function() {
						return this.name;
					},
					"a@href": function() {
						return "https://boardgamegeek.com/boardgame/" + this.id;
					},
				}
			},
			"#members-list": {
				"member<-members": {
					"a": "member.name",
					"a@href": function() {
						return "https://boardgamegeek.com/user/" + this.bgg_username;
					}
				}
			}
		});
	});
