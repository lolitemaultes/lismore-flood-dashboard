# 🌊 Lismore Flood Emergency Dashboard

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
[![Live Demo](https://img.shields.io/badge/View%20Live-Demo-brightgreen)](https://lismore-flood-dashboard.onrender.com)

A real-time emergency dashboard to monitor flood conditions in the Lismore, NSW area. This dashboard aggregates critical information from multiple sources to assist emergency management and the public during flood events.

![Lismore Flood Dashboard](https://github.com/user-attachments/assets/406417d6-c64b-4671-b318-690e95b34e34)


## 🚨 Features

- **Real-Time Flood Impact Map**: This map displays street addresses and areas within Lismore that are currently affected by floods in Lismore, using floor height council data
- **Interactive Flood Height Plot Data**: Provides 4 days of water level height data in an interactive graph
- **Live River Level Monitoring**: Real-time data from Bureau of Meteorology (BOM) gauges
- **Traffic Webcam Integration**: Live view of road conditions at Bruxner Highway
- **Rainfall Radar**: Current precipitation patterns from BOM Grafton radar
- **Power Outage Information**: Essential Energy outage data with emergency contact information
- **Emergency Contacts**: Quick access to SES, emergency services, and evacuation centers
- **Console Command Listing**: List of console commands shown for testing purposes
- **Flood Statistics**: At-a-glance metrics for key monitoring stations
- **Responsive Design**: Works on desktop and mobile devices
- **Offline Capability**: Caches data for use during network outages
- **Useful Resource Panel**: Provides links to other websites to help monitor weather activity

## 👀 Upcoming Features
- **Animated Rain Radar**: This feature will replace the radar tab with animated radar imagery for the Grafton area
- **Flood Map Water Level Simulation**: This feature will add a simulated water rise element to the Flood Map
- **Localised Rise & Fall Prediction**: This feature will ensure the rising and falling of flood levels are accurate, based on previous flood data

## 🔧 To-Be-Fixed
- **Minor Restyling**: Restyling to few elements on the dashboard
- **Flood Classification Update**: Realistic flood classification for Major, Moderate and Minor flooding

## ⚙️ Technical Architecture

The dashboard consists of two primary components:

1. **Frontend (index.html)**: Browser-based dashboard with responsive UI
2. **Backend (server.js)**: Node.js proxy server to fetch and parse flood data from BOM

```
📁 lismore-flood-proxy/
│
├── 📄 server.js          # Proxy server to fetch & parse BOM data
├── 📄 package.json       # Node.js dependencies
└── 📁 public/            
    ├── 📄 index.html     # Main dashboard interface
    └── 📁 resources/     # Static assets for the dashboard and user information
```

## 🔧 Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/lolitemaultes/lismore-flood-dashboard.git
   cd lismore-flood-dashboard/lismore-flood-proxy
   ```

2. Install dependencies:
   ```bash
   npm install express axios cheerio cors
   ```

3. Start the server:
   ```bash
   node server.js
   ```

4. Open the dashboard in your browser:
   ```
   http://localhost:3000
   ```

## 🌐 API Endpoints

The server exposes the following API endpoints:

- **GET /flood-data**: Returns parsed flood data from the BOM website
  ```json
  {
    "success": true,
    "timestamp": "2023-03-08T12:34:56.789Z",
    "data": [
      {
        "location": "Wilsons R at Lismore (mAHD)",
        "time": "12:30PM 08/03/2023",
        "waterLevel": 4.35,
        "status": "rising",
        "floodCategory": "Minor"
      },
      ...
    ],
    "source": "http://www.bom.gov.au/nsw/flood/northern.shtml"
  }
  ```

- **GET /status**: Health check endpoint for server status

## 📊 Flood Categories

The dashboard uses the following standard BOM flood categories:

| Category | Threshold (meters) | Impact                                      |
|----------|-------------------|---------------------------------------------|
| Minor    | 4.20+             | Low-lying areas near rivers and streams      |
| Moderate | 7.20+             | Above floor flooding of some rural buildings |
| Major    | 9.70+             | Extensive rural and urban flooding           |

## 🛠️ Customization

### Modifying Critical Locations

To modify the list of key monitoring stations displayed in the "Key Monitoring Stations" view, edit the `criticalLocations` array in the `renderFloodData()` function:

```javascript
const criticalLocations = [
    'Wilsons R at Woodlawn (mAHD)',
    'Browns Ck Pump Station',
    'Lismore (Dawson Street)',
    'Wilsons R at Lismore (mAHD)',
    'Leycester Ck at Tuncester (mAHD)',
    'Leycester Ck at South Lismore'
];
```

### Adding New Data Sources

To add new data sources, modify the `server.js` file to include additional endpoints or modify the existing flood data parsing logic.

## ⚠️ Disclaimer

This dashboard is intended for emergency use and information purposes only. Always follow directions from emergency services during flood events. The data presented is sourced from official channels but may not always be up-to-date or accurate due to network issues or other technical constraints.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Bureau of Meteorology](http://www.bom.gov.au) for river height data
- [Transport for NSW](https://www.transport.nsw.gov.au) for traffic camera feeds
- [Essential Energy](https://www.essentialenergy.com.au) for power outage information

## 📞 Contact & Support

For issues, feature requests, or contributions, please open an issue on this repository
