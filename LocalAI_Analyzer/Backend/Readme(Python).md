# Backend(Python)
# README

## Download The Backend Folder:
### 🔗 [Backend](.)
#### server.py
#### requirements.txt
#### data/taxonomy_embeddings.json


## Download The Model:
### 🔗 [Download(google drive)](<https://drive.google.com/drive/folders/10xltg0C5NuTiBS5DiKPAyDkjLaBNQ0BC?usp=drive_link>)

#### PATH:Backend/data/sentence-transformers--all-mpnet-base-v2




## Setup:
#### Make sure that the model has been downloaded to the correct location

### Mac:

```bash
cd Backend

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

python server.py
```

### Win:

```bash
cd Backend

python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt

python server.py
```


