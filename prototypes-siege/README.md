# Siege Pact: team castle siege (throwaway prototype)

**Question it tests:** can a 3v3 to 5v5 siege *force* teammates to coordinate,
instead of five people doing their own thing side by side?

Open `index.html` in a browser. Nothing to install. You play one hero; bots fill
every other seat on both teams and follow your team calls. There is no
networking. The point is to feel the rules before building multiplayer.

## The coordination hooks

Every hook needs **two or more people doing different things at the same time**:

| Hook | Attackers | Defenders |
|---|---|---|
| **Two-person jobs** | The battering ram only moves while someone holds `E` next to it: 1 pusher crawls, 2 walk, 3+ roll (an Engineer counts as 2). Pushers can't fight well, so someone must guard them. | Boiling oil pours only when **both pads** at a gate are occupied at once. It's a huge hit on the ram and anyone under it, with an 18s cooldown. |
| **Commitment** | Rock walls split the lanes. Changing lanes after committing sends the ram back to the middle gap, which costs a lot of time. | Defenders move between gates inside the walls (short interior lines), but they only see what their team sees (fog). |
| **Timing** | Dead attackers respawn **together** in waves every 10s. Pushing before your wave arrives is a real decision. | Respawn timers grow each minute. Late deaths hurt more. |
| **Roles** | Engineer (ram + bombs), Knight (Shield Wall), Archer (Volley), Cleric (Heal) | Engineer repairs and rebuilds gates and plugs breaches with a Barricade |
| **Calls** | `1/2/3` sets the lane, `4` rallies bots to you, `0` hands control back to the bots | same |

Win: attackers destroy the Keep. Defenders win by surviving 5 minutes.

## Balance (bot vs bot, 20 games each)

| Size | Attacker wins | Notes |
|---|---|---|
| 3v3 | ~45% | first breach ≈ 70s |
| 4v4 | ~40% | |
| 5v5 | ~25% | ram HP scales with team size; defenders still a bit strong |

Most games are decided in the last minute. All numbers are in `TUNE` at the top
of the script.

## Playtest questions

1. Did you ever **need** a teammate, or could you have done it alone?
2. Were the two-person jobs (ram, oil) fun, or did they feel like chores?
3. Did the lane split make calls matter ("they're going North!"), or was it just walking?
4. Did the wave respawn make attackers group up, or just add waiting?
5. Did you use calls? Were bots following your call a good stand-in for human teammates?
6. Which side was more fun? Which role was the most and the least fun?
