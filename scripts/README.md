# Data scripts

Python scripts to fetch Nebula API and RMP data into JSON for the app.

## Setup (Python env)

From the **nebula-galaxy** project root:

```bash
# Create a virtualenv for scripts (recommended)
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r scripts/requirements.txt
```

Or install globally:

```bash
pip install -r scripts/requirements.txt
```

## Run

**Nebula API** (courses, professors, grade distributions):

```bash
python scripts/fetch_nebula.py -o public/nebula_data.json
```

**Rate My Professor** (scrape UTD professors → template or scraped data):

```bash
python scripts/fetch_rmp.py -o public/rmp_data.json
```

Output files are written under `public/` so the app can load them at `/nebula_data.json` and `/rmp_data.json` if you wire them in.
