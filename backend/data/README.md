# Data Directory

This folder holds the harmonized satellite fire datasets:
- `hotspots_harmonized.parquet` (point-level MODIS & VIIRS fire detections)
- `monthly_grid_counts.parquet` (monthly gridded count aggregations)

### Generating Testing Data
To generate mock data for local exploration and testing:
```bash
python scripts/generate_mock_data.py
```
This produces realistic data matching the NASA FIRMS schema for Gujarat, India (2001–2024).

### Real Data Integration
To use real production data from your harmonization pipeline, place your Parquet files in this directory and update `backend/app/config.py` if column names differ.
