"""Refresh `static/json/courses_info.json` from McGill's course catalogue."""

from degreeviz.catalogue.course_scraper import parse_args, scrape_mcgill_courses


if __name__ == "__main__":
    args = parse_args()
    report = scrape_mcgill_courses(
        output_path=args.output,
        report_path=args.report,
        start_year=args.start_year,
        workers=args.workers,
        delay=args.delay,
    )
    print(f"Saved courses to {args.output}")
    print(f"Saved refresh report to {args.report}")
    print(f"New courses: {len(report['new_courses'])}")
    print(f"Removed courses: {len(report['removed_courses'])}")
