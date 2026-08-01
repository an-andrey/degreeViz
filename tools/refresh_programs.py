"""Refresh `static/json/programs.json` from McGill's program catalogue."""

from degreeviz.catalogue.program_scraper import DEFAULT_OUTPUT_PATH, refresh_program_index


if __name__ == "__main__":
    programs = refresh_program_index()
    print(f"Saved {len(programs)} programs to {DEFAULT_OUTPUT_PATH}")
