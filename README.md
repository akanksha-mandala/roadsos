# 🚨 RoadSoS – Emergency Response System

RoadSoS is a location-aware emergency response platform that provides **real-time assistance during road incidents**, even in **low-connectivity or offline scenarios**.

It integrates emergency service discovery, intelligent routing, road risk analysis, and incident reporting into a unified system.

---

## 🌐 Live Demo

🔗 https://roadsos-vqbg.onrender.com

---

## 🎯 Problem

* Difficulty finding nearby emergency services quickly
* Delays due to poor network connectivity
* Lack of a unified platform combining routing, services, and offline support

---

## 💡 Solution

* 📍 Real-time location detection
* 🚑 Nearby emergency services (OpenStreetMap)
* 🛣 Route computation with risk awareness
* ⚠️ Road Risk Scoring (based on accidents, time, road type)
* 📡 Offline Emergency Kit (works without internet)
* 🧾 Incident reporting with transparency

---

## 🔥 Key Features

### 🚨 Emergency SOS

* One-tap emergency access
* Location-based service suggestions
* Always-available emergency numbers

### 🧭 Smart Routing

* Real-time route computation (OSRM)
* Road-type detection (Urban / Highway / Rural)
* Live route tracking

### ⚠️ Road Risk Scoring

* Based on:

  * Accident density
  * Time of day
  * Road type
* Output: 🟢 Low · 🟡 Medium · 🔴 High risk

### 📡 Offline Emergency Kit

* Works without internet
* One-tap calling (112, 108, 100, 101, etc.)
* Cached nearest hospital

### 🔍 Service Discovery

* Finds hospitals, police, ambulance, towing, etc.
* Uses OpenStreetMap with offline fallback

### 🧾 Incident Reporting

* Report accidents, hazards, roadblocks
* View reports on map
* Community-driven safety data

---

## 🧠 Tech Stack

**Frontend:** HTML, CSS, JavaScript, Leaflet.js
**Backend:** Python, Flask (modular architecture)
**APIs:** OpenStreetMap (Overpass), OSRM
**Deployment:** Render + Gunicorn

---

## 🏗 Project Structure

```
roadsos/
├── app.py
├── backend/
│   ├── routes/
│   ├── services/
│   └── data/
├── frontend/
│   ├── templates/
│   └── static/
└── requirements.txt
```

---

## 🚀 Run Locally

```bash
git clone https://github.com/akanksha-mandala/roadsos.git
cd roadsos
pip install -r requirements.txt
python app.py
```

Open: http://localhost:5000

---

## 📖 API Endpoints

| Method | Endpoint              | Description          |
| ------ | --------------------- | -------------------- |
| GET    | /api/emergency/nearby | Find nearby services |
| POST   | /api/route/compute    | Compute route        |
| POST   | /api/reports/submit   | Submit report        |
| GET    | /api/reports/all      | Fetch reports        |

---

## 🌍 Impact

* Faster emergency response
* Works in low-network areas
* Improves road safety awareness
* Enables community-driven data

---

## 🔮 Future Scope

* Real-time traffic integration
* ML-based accident prediction
* Government API integration
* Voice-based SOS

---

## 👩‍💻 Author

**Akanksha Mandala**
🔗 https://github.com/akanksha-mandala

---

## 🏁 Conclusion

RoadSoS is a practical system designed to ensure that in emergencies, **help is found in seconds, not minutes**.

> *"When every second matters, we find help first."*
