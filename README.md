# Pokémon Gen Matchup

Pick two generations and line up their evolution families against each other, with a pink `=`, `>` or `<` for each matchup and green slashes when one side needs more than one family. Then save the chart as a PNG.

## Use it
Open `index.html` in a browser (or turn on GitHub Pages for this repo). It's all static files with no build step.

- **Pick from the lists**: tap a family to drop it into the highlighted row. Once a row has both sides filled, the next pick starts a new row. Tap a row first if you want to add more families to it.
- **Tap the pink sign** to cycle `=` → `>` → `<`. **Tap a green slash** to add a sign between families on the same side.
- **Tap a row**, then tap a Pokémon in it to send its family back to the list. The row toolbar moves, flips and deletes rows.
- **Auto-match** pairs the remaining families by type and evolution-line length, so you only have to make the calls.
- **Copy link** gives you a URL with the whole chart in it. **Save image** exports a PNG. Your work also autosaves in the browser.

## Data
`data/pokemon.js` is generated from [PokeAPI](https://github.com/PokeAPI/pokeapi) CSVs by `tools/build_data.py`. A family means the species from one generation that share an evolution chain, so Chansey counts as Kanto while Blissey counts as Johto. Sprites load from the PokeAPI sprites repo.
