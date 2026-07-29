# DegreeViz

## What's DegreeViz? 

As a first year McGill student, I was left confused on how to ensure that all my pre-requesities are met, and I'm taking all my courses when needed. To help, I created DegreeViz.

With a simple UI, this allows users to select their McGill program from the dynamic search bar, and automatically get a generated directional graph that shows prerequisite relationships.

The most recent features that have been added are: 
 - ability to add minors and/or other majors to the graph
 - save plans to a user profile
 - basic modifications of the graph for customization (add, delete, modify nodes and edges, etc.)


## Deployment Locally

To run DegreeViz locally, you can install all required packages with ``pip install -r requirements.txt``, or any other package manager of choice. Then, you can simply run the command

`` python app.py ``

and that should give a link to run the site locally in a dev environment.

Here's a basic run-down of what's where: 
As a Flask app, the core request handling is stored in ``app.py``. Runtime helper code lives in the ``degreeviz`` package:
- ``degreeviz/programs/graph_builder.py`` builds graph data from a selected program.
- ``degreeviz/programs/llm_prerequisites.py`` calls Gemini to simplify prerequisite text.
- ``degreeviz/programs/requirements.py`` parses program requirement buckets.
- ``degreeviz/catalogue/course_scraper.py`` refreshes the static McGill course catalogue JSON.
- ``tools/`` contains manual maintenance commands, such as refreshing courses, programs, and honours mappings.

Finally, the ``/templates`` directory holds all HTML files for the front-end, along with the ``/static`` directory, which has browser JS, CSS, images, and static JSON data.

## What I'm working on 

DegreeViz is still a work in progress, and I'm open to contribitors which can submit PR requests so I can merge them in. Here's a few things that are currently on my drawing board for this project: 
- Improving saved-plan migrations as the graph schema evolves
- Re-doing the UI to be more modern. I'm not a front-end dev and so this is more challenging for me
- Incorporating better CI/CD tests to get basic tests before deployment
- Have better monitoring. Although I have basic monitoring, recently the Gemini API migrated to a new package and structure, which broke my website when making API calls. Unfortunately, the only way I found out about it was by going on the site myself, which is not ideal...

If you have any other ideas, please feel free to reach me at andrey.ambartsumov@mail.mcgill.ca!
