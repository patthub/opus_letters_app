# OPUS — the correspondence of Sir Henry Wotton

A reading interface for 526 letters written between 1589 and 1639 by Sir Henry Wotton —
English ambassador to Venice, later Provost of Eton. Catalogued by the OPUS project.

**Live: https://patthub.github.io/opus_letters_app/**

Five ways through the corpus, one letter sheet shared by all of them:

| view | what it shows |
|---|---|
| **Letters** | the catalogue, led by each letter's incipit; search across incipits, names and subjects |
| **Time** | an itinerary — each lane is a place Wotton wrote *from*, the horizontal axis is time |
| **People** | correspondents; a radial layout where the angle is the year of the first letter |
| **Places** | origins and destinations on a coastline drawn from the data, no external tiles |
| **Query** | a Cypher console — needs a live database, see below |

Interface in English and Polish (`?lang=en` / `?lang=pl`, or the switch in the left rail).
The letters themselves are never translated: they are sources, not interface.

## Scans and transcriptions

Every letter can open a reader: the scan on the left, the text on the right. The scan is
served over **IIIF**, the standard libraries publish their holdings in, so the same reader
handles our own material and a manifest from the Bodleian, the British Library or Internet
Archive without a line of new code.

Four optional fields per letter, filled in the OPUS spreadsheet:

| column | what it holds |
|---|---|
| `iiif_manifest` | URL of a IIIF manifest — ours or someone else's |
| `iiif_canvas` | which leaf to open on, counting from 0; blank means the first |
| `transcript_text` | the transcription itself, as text; it appears beside the scan |
| `scan` | a plain image URL, used only when there is no manifest |

`transcription` (a link to a document) still works and opens in a new tab, but a link cannot
be shown beside the image — only `transcript_text` can.

### Turning our own scans into IIIF

No image server needed. `tools/make_iiif.py` cuts a folder of scans into static tiles that
any web host can serve:

```bash
python3 tools/make_iiif.py ../scans      # scans/<letter_ID>/01.jpg, 02.jpg …
```

It writes `iiif/<letter_ID>/manifest.json` plus level-0 tiles, and prints the value to put in
`iiif_manifest`. The output is ordinary IIIF, so Mirador and the Universal Viewer read it too.

A 300 dpi page comes to roughly 2 MB of tiles. GitHub Pages has a soft 1 GB repository limit
and 100 GB of monthly traffic, so past a few hundred letters the `iiif/` directory belongs on
separate storage (R2, S3) with absolute URLs in `BASE` at the top of the script.

## Two data sources, one shape

The page reads either a live **Neo4j** over Bolt, or the frozen `opus.json` that ships with it.
Nothing else in the application knows which one it got.

- **On this site** there is no backend and no database. `opus.json` holds the whole corpus:
  475 kB, about 90 kB gzipped. It is a closed corpus, not a live system — there is nothing to
  query in real time.
- **With the database running locally** the page connects to `bolt://localhost:7687` and the
  Cypher console works. The source is printed at the bottom of the left rail.

`opus.json` is written by the project's converter alongside the Neo4j CSV files, so it cannot
drift from the graph.

## Running it locally

The site is plain files — no build step, no framework, no bundler.

```bash
python3 -m http.server 8080     # from this directory
```

To get the Cypher console as well, run the OPUS converter and its Neo4j (see the main project
repository), then reload from `localhost`.

## What the design says

- The colour is **carta azzurra**, the blue-grey rag paper made in Venice from the sixteenth
  century onward. Wotton spent twenty years there.
- **Rubric red means one thing only: an uncertain date.** 323 of the 526 dates carry an
  editorial caveat — inferred, uncertain or approximate — so the red is a tone, never an alarm.
  A red date in the catalogue was supplied by an editor, not by Wotton.
- Three typefaces, three voices: EB Garamond speaks for the letters, Archivo for the catalogue,
  IBM Plex Mono for the data.
- The hero of each letter sheet is the date **as Wotton wrote it** — *9th of December, CIↃIↃXC.
  Style of Rome.* The normalised `1590-12-09` sits underneath, small. The whole project lives in
  that gap, and the interface shows it rather than hiding it.

## Credits

Letters edited by Logan Pearsall Smith, *The Life and Letters of Sir Henry Wotton* (Oxford, 1907).
Coastline from Natural Earth via [world-atlas](https://github.com/topojson/world-atlas).
