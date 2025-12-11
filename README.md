
<div align="center">
  <a href="https://bangrui95.github.io/LocalAI_Analyzer/">
    <img src="image/LOGO.png" width="199px">
  </a>
</div>

# LocalAI Analyzer
### [🌐 LocalAI_Analyzer](https://bangrui95.github.io/LocalAI_Analyzer/)


A browser extension that uses local models for offline data analysis, converting web browsing history into personal interest labels to support personalised content recommendations.

<div align="center">
    <img src="image/readme_image/FAQ/Screenshot 2025-12-11 at 01.47.51.png" width="auto">
  </a>
</div>

# 
## Application Architecture

#### This application consists of two main modules: a browser extension (frontend) and a local Python backend analysis system. The two components communicate locally, combining FastAPI, SentenceTransformers, JavaScript, and HTML/CSS to deliver a fully on-device personalized recommendation system.

### The system currently supports Chromium-based browsers (e.g., Google Chrome, Microsoft Edge, Brave, Arc) and local backend execution on macOS and Windows.

## Applications

### Browser-extension

#### Frontend UI for the browser:

•	Interest tag editing page

•	Personalized recommendation page

•	Browser history import and settings page

### Technologies used:
#### HTML, CSS, JavaScript, Chrome Extension Manifest v3

#

### Backend

#### A local backend system built with Python + FastAPI:

•	Embedding models (SentenceTransformer)

•	Analyzing browser history files

•	Generating interest tags (IAB Taxonomy)

•	Performing deep webpage parsing (BeautifulSoup)

•	Providing RSS subscription analysis and personalized recommendations

### Technologies used:
#### FastAPI, Uvicorn, SentenceTransformers, BeautifulSoup, NumPy, JSON

#

## Dowload:
### Browser_extension: [🔗Link](https://drive.google.com/drive/folders/19L_4yPwL5UBmnd_i-g22QqQ5pGPtXnSj?usp=drive_link)

### Backend （Mac）:[🔗Link](https://drive.google.com/drive/folders/1fOTmFW8-qO8_eq2RZ0VW3gkd2RWTZ7iH?usp=drive_link)

### Backend （Windows）:[🔗Link](https://drive.google.com/drive/folders/1H2T7Zp49r7JaXkyLdZ6qC29JDV4I8QiK?usp=drive_link)


##  Installation:
#### Since the project is currently in testing, it does not support installation from the extension store yet. Please download the extension package and install it locally.

### 1️⃣ Enable Developer Mode in your browser and load the extension package locally.

![use](image/Use.png)

### 2️⃣ Open the local backend system(LocalAI Analyse)

#### Mac
![alt text](<image/readme_image/Screenshot 2025-12-10 at 18.41.26.png>)

#### Win
![alt text](image/readme_image/bc4b22df4e119a0cd0dbe8dac18ec69f.png)

### 3️⃣ Self-check & local connection
![alt text](<image/readme_image/Screenshot 2025-12-10 at 17.56.54.png>)

# 

## How to Use：

### ➡️ Launch panel
Open the local backend system and establish a communication connection
<p align="center">
  <img src="image/readme_image/Screenshot 2025-12-10 at 17.55.10.png" width="48%">
  <img src="image/readme_image/Screenshot 2025-12-10 at 17.54.18.png" width="48%">
</p>



### ➡️ Setting page
#### Analysis Setting
Adjust the analysis range of historical data, and set the number and levels of personalised tags.
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.01.51 - GIF 动图.gif>)


Choose whether to enable deep analysis (using BeautifulSoup to scrape page content) and set a website blacklist.

![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.02.37 - GIF 动图.gif>)

#### Personalized Recommendation Setting
Choose whether to enable personalized recommendations.
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.03.13 - GIF 动图.gif>)

Build a personal article library, subscribe to RSS sources, and enable auto-updates.
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.05.30 - GIF 动图.gif>)

Manually update or delete the local article library
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.06.20 - GIF 动图.gif>)



### ➡️ Personalized Labels
Add custom topic tags, and the system will display related content on the recommendation page.

![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.15.29 - GIF 动图.gif>)


Adjust the weight of different tags, and the system will modify the number of recommendations based on their relevance.
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.13.35 - GIF 动图.gif>)


Restore deleted tags
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.17.17 - GIF 动图.gif>)

Restore to the system-generated tag state
![alt text](<image/readme_image/Screen Recording 2025-12-10 at 18.16.41 - GIF 动图.gif>)

### ➡️ Personalized recommended content

Enable personalized content recommendations
![alt text](<image/readme_image/Screenshot 2025-12-10 at 19.08.47.png>)


<p align="center">
  <img src="image/readme_image/Screenshot 2025-12-10 at 18.11.37.png" width="49%">
  <img src="image/readme_image/Screenshot 2025-12-10 at 18.12.19.png" width="49%">
</p>

The system recommends content based on your personal interest tags, and all recommended articles come from your subscribed sources.

![alt text](<image/readme_image/My Movie - GIF 动图.gif>)


### ➡️ Backend system

#### 🎛️ System Check

![alt text](<image/readme_image/Screenshot 2025-12-10 at 19.29.59.png>)


#### 🎛️ Local communication connection
`INFO:     Uvicorn running on http://127.0.0.1:11668`

![alt text](<image/readme_image/Screenshot 2025-12-10 at 19.32.09.png>)



#### 🎛️ Enable deep analysis
`[Setting] Setting: deepParsing=True, TOP_N=5, THRESHOLD=0.39, granularityLevel=3, samplingCount=100, blacklistCount=2`


`[Analysis] Starting full analysis pipeline...`



![alt text](<image/readme_image/Screenshot 2025-12-10 at 18.29.43.png>)


#### 🎛️ Update the article subscription database

`[RSS] Update request received — starting fetch and analysis...`

`[Setting] Configuration loaded: {   }`

`[RSS] Only keeping articles newer than xx days.`

`[RSS] Summary saved, total: xxx items`

![alt text](<image/readme_image/Screenshot 2025-12-10 at 19.43.13.png>)


#### 🎛️ Enable auto-update
`[AutoUpdate] Waiting x hours before first automatic update...`

![alt text](<image/readme_image/Screenshot 2025-12-10 at 19.46.57.png>)



# 

## FAQ

### ➡️ Apple could not verify “LocalAI_analyse” is free of malware


The analysis system is currently in a testing phase and is not available on any platforms. You will need to manually grant trust before it can run properly.

![alt text](image/readme_image/FAQ/c3d6178dbb58d5242a4279e91a232106.png)

![alt text](image/readme_image/FAQ/bef061c776b76cc939df5a50a642084f.png)


Because the backend program is not signed or notarized by Apple, macOS may block it during development. This issue will be resolved in the official release, but for now you will need to manually remove the restriction.

####  Run the command in Terminal
`xattr -dr com.apple.quarantine "~/Downloads/LocalAI_analyse"`

`xattr -dr com.apple.quarantine "/YOUR_PATH/LocalAI_analyse"`

![alt text](image/readme_image/FAQ/8695fcd7d8cb3c5d12313f7ef791a043.png)



### ➡️ Unable to find the history file
To prevent information leakage, the local backend system only accesses the fixed folder path “browser_history.” If the browser’s download location has been changed, the system will be unable to locate the corresponding file.
#### Please use the system’s default download path, or manually select a download path to browser_history.
![alt text](<image/readme_image/FAQ/Screenshot 2025-12-10 at 20.16.49.png>)


### ➡️ Unable to use the personalized recommendation page
The personalized recommendation page relies on the browser’s New Tab page, so using this feature requires replacing the default New Tab page.

#### Select"Keep it" to allow this extension to replace the New Tab page.

![alt text](<image/readme_image/FAQ/Screenshot 2025-12-10 at 20.30.26.png>)




# 

## 📇 Contact

### The project is under continuous development. If you have any questions or suggestions, feel free to contact the author.

### Bangrui: wbangrui95@outlook.com

# 

<div align="center">
    <img src="image/image.png" width="auto">
  </a>
</div>


<div align="center">
  <p>© 2025 LocalAI Analyzer — Designed by Bangrui Wang</p>
</div>
