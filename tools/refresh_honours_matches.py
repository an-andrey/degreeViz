"""Refresh `static/json/honours_matches.json` from course titles."""

from degreeviz.catalogue.honours import DEFAULT_OUTPUT_PATH, refresh_honours_matches


if __name__ == "__main__":
    honours_matches = refresh_honours_matches()
    print(f"Saved {len(honours_matches)} honours matches to {DEFAULT_OUTPUT_PATH}")
