# DegreeViz

## What's DegreeViz? 

As a first year McGill student, I was left confused on how to ensure that all my pre-requesities are met, and I'm taking all my courses when needed. To help, I created DegreeViz.

With a simple UI, this allows users to select their major from the dynamic search bar, and automatically get a generated directional graph which idicated what needs to be taken what. 

The most recent features that have been added are: 
 - ability to add minors and/or other majors to the graph
 - export the graph as JSON to return to it later
 - basic modifications of the graph for customization (add, delete, modify nodes and edges, etc.)


## Deployment Locally

To run DegreeViz locally, you can install all required packages with ``pip install -r requirements.txt``, or any other package manager of choice. Then, you can simply run the command

`` python app.py ``

and that should give a link to run the site locally in a dev environment.

Here's a basic run-down of what's where: 
As a Flask app, the core of the website handling is stored in ``app.py``, but the remaining helper python functions are all stored in the ``/scripts`` directory. The main ones are:
- ``get_prereqs.py`` which is the GEMINI API calls to structure the pre-reqs, 
- ``prepare_data.py`` formats the output to be compatible for the graph data
- ``get_program_codes.py`` scrapes basic course code info from the McGill course catalogue based on the selected major by the user

Finally, the ``/templates`` directory holds all html files for the front-end, along with the ``/static`` directory, which has all JS and CSS code for foratting.

## What I'm working on 

DegreeViz is still a work in progress, and I'm open to contribitors which can submit PR requests so I can merge them in. Here's a few things that are currently on my drawing board for this project: 
- Allowing people to create an account and store graphs in a DB instead of exporting JSON files
- Re-doing the UI to be more modern. I'm not a front-end dev and so this is more challenging for me
- Incorporating better CI/CD tests to get basic tests before deployment
- Have better monitoring. Although I have basic monitoring, recently the Gemini API migrated to a new package and structure, which broke my website when making API calls. Unfortunately, the only way I found out about it was by going on the site myself, which is not ideal...

If you have any other ideas, please feel free to reach me at andrey.ambartsumov@mail.mcgill.ca!
