# The world: four factions

Every character comes from one of four lands, the way a League champion comes from one region. A land is broad enough to hold dozens of characters. Inside it, each class belongs to an **order**, which is a smaller group with its own look and story. A new character needs a land and an order, and the order may be new.

Lands are story only. No rule in the game reads a character's land, nothing gives a bonus for it, and a party can mix any lands. The land shapes how a character is designed instead, so its kit feels like it came from there (see "Designing a character from its land").

## History

Long ago the world was held shut, the way a door is. Magic stayed on the far side of it, the dead crossed over on their own, and every hour came after the one before.

Then a great working went wrong in a city of scholars, and the door cracked open. People call it **the Unmooring**. A tear opened in the earth and raw magic poured out, and four things came loose at once.

- **Magic.** It spilled out of the tear, and the city that caused it rebuilt itself around the wound to study it and sell it. That city is the **Gilded Rift**.
- **Growth.** The magic soaked into the southern forests. In one generation they grew over the old roads, the rivers and the kingdoms, until the treetops became a country of their own. That's the **Tangled Crown**.
- **Death.** The dead stopped finding their way. They gathered in the marshes along the black river, and the priests who learned to row them across became the **Ashen Ferry**.
- **Time.** Hours began to slip and repeat. A mountain monastery swore that someone would always be awake to ring the next one, and the realm that grew around that vow is the **Sworn Heights**.

Open war between the lands wakes the Rift. The first one nearly tore it wider. Since then the four lands have kept **the Accord**. A quarrel is settled by a **Trial**, three champions against three on ground both sides agree to. Champions are sworn to the Trial, not to their land, so a party can mix any lands. A Ferry priest can fight next to a Rift mage, and that alone can start a feud back home.

## The four lands

Each land has a main colour, a metal or material for accents, and one **glow colour**. The glow is how a land reads at battle zoom, so no two lands share a glow. No land paints a large area in team blue `#5b8cff` or team red `#ff6b5b`. The `team` material (scarf, sash, hood trim) stays the only place those colours appear.

| | Gilded Rift | Tangled Crown | Ashen Ferry | Sworn Heights |
|---|---|---|---|---|
| What it is | A scholar city built around the tear | A canopy kingdom over a drowned forest | Marshlands along the river of the dead | A mountain realm where everyone lives by a vow |
| Main colour | Violet `#5a30c4` | Bark `#4b3524`, moss `#5f6b2e` | Deep teal `#275f48` | Ochre `#ad7a2c` |
| Accent | Gold `#e8b648` | Woven silk, raw wood | Bone `#ddd0b0`, silver | Brass `#f5cc52`, oak |
| Glow | Rift lilac `#c9a8ff` | Orchid magenta `#ff5ad8` | Lantern mint `#5dffc0` | Bell amber `#ffb640` |
| Shapes | Rings, floating parts, tall hats | Hoods, layered leaves, many limbs | Hoods, lanterns, long curved blades | Masks, heavy frames, squared shoulders |
| Mood | Proud, curious, careless | Patient, hungry, close-knit | Calm, ritual, never in a hurry | Strict, tireless, bound by duty |
| Home map | Storm Court | Shattered Span | (none yet) | Sun Altar |

The maps already fit. The Storm Court is a Rift observatory where the leaking magic breaks the sky. The Shattered Span is an old Crown bridge the forest is pulling down. The Sun Altar is a Heights shrine where the hour is judged.

## Designing a character from its land

Each land came out of one force loosed by the Unmooring. A character's mechanic and skills should read as that force, so a player can guess a newcomer's land from its kit alone. These are design guides, not rules the engine checks.

| Land | Force | A kit from here tends to | It rarely |
|---|---|---|---|
| Gilded Rift | Magic | Set up big areas and pay them off later, hit hard at range, pay for power with HP or a drawback | Heals or hides |
| Tangled Crown | Growth | Leave terrain that spreads, move units around, grow stronger the longer a battle runs | Bursts from far away in one turn |
| Ashen Ferry | Death | Trade HP, curse, feed on Downs, bring allies back | Moves fast |
| Sworn Heights | Vows | Guard allies, bend the turn order, set a condition and punish whoever breaks it | Leans on chance |

The five classes fit. Calls are Rift magic that lands later, Souls are the Ferry's trade in the dead, and Toll is the Heights keeping the hour. The Marionettist is the Heights' vow made flesh: a Doll that stands where it was told to, and strings that make a body keep its place. The Mirrormime is Rift magic paid back with interest: every blow it takes comes home to whoever threw it, and its glass shows the enemy a way through that isn't there. The Crown has no class yet: its slot is open for a new one.

## Orders and future characters

| Land | Order today | Class | Other orders and characters it could hold |
|---|---|---|---|
| Gilded Rift | **The Last Almanac**, who write down the sky's future and then make it happen | Astromancer | Golem-smiths, alchemists, mirror-witches, rune-tattooed brawlers, beasts the Rift changed |
| Gilded Rift | **The Glass Carnival**, harlequins who perform in the Rift's halls of mirrors and send stray magic back to whoever cast it | Mirrormime | |
| Tangled Crown | None yet; the Crown's order arrives with its class | (open) | Spider-kin, beast-kin hunters, druids, venom-witches, tree-giants, river raiders |
| Ashen Ferry | **The Ferrymen**, bone priests who row souls across | Gravecaller | Plague doctors, mourners, ghosts, bone-carvers, drowned knights |
| Sworn Heights | **The Unslept Hour**, monks sworn to ring every hour | Bellringer | The Bronze Vigil (shield-sworn guards), oath-knights, clockwrights, pilgrims, a mute duelist |
| Sworn Heights | **The Kept Promise**, masked puppeteers who carve a doll for every vow sworn and make a body keep the vow its owner broke | Marionettist | |

## What this changes in the art

- The Astromancer, Gravecaller and Bellringer already match their land. The Marionettist wears the Heights' ochre and brass with amber glow, and the Mirrormime the Rift's violet and gold with lilac glow.
- The Crown's colours (bark, moss, orchid glow) wait for its class. Purple is the Rift's colour.
- Each figure in `art/figures/<class>.py` takes its land's main, accent and glow colours from the table above.
