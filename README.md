![Lismore Flood Dashboard](https://github.com/user-attachments/assets/406417d6-c64b-4671-b318-690e95b34e34)

# Lismore Flood Dashboard

![Version](https://img.shields.io/badge/version-2.8.0-purple)
![License](https://img.shields.io/badge/license-MIT-green)
[![Live Dashboard](https://img.shields.io/badge/Lismore-Flood%20Dashboard-blue)](https://flood.lolitemaultes.online)

A real-time emergency dashboard for monitoring flood conditions in the Lismore, NSW area. This application aggregates critical information from multiple official sources to assist emergency management personnel and the public during flood events.

## Features

- **Interactive Flood Impact Map**
- **Realistic Floodwater Elevation Simulation**
- **Interactive River Height Graphs**
- **Live River Level Information**
- **Traffic Webcam Integration**
- **Interactive BoM Rainfall Radar**
- **Live Power Outage Map**
- **Emergency Information**
- **Basic Flood Statistics**
- **Responsive Design**

## Technical Architecture

The dashboard consists of two primary components and multiple backend scripts:

1. **Frontend (index.html)**: Browser-based dashboard with responsive UI
2. **Backend (server.js)**: Node.js proxy server to fetch and parse flood data from multiple sources

```
lismore-flood-proxy/
├── server.js
├── package.json
└── public/
    ├── index.html
    ├── flood-data.json
    ├── css/
    │   ├── main.css
    │   ├── buttons.css
    │   ├── cyclone.css
    │   ├── emergency.css
    │   ├── floodmap.css
    │   ├── header.css
    │   ├── layout.css
    │   ├── modals.css
    │   ├── notifications
    │   ├── outagemap.css
    │   ├── panels.css
    │   ├── radar.css
    │   ├── responsive.css
    │   ├── river.css
    │   ├── stats.css
    │   ├── tables.css
    │   ├── tabs.css
    │   ├── utilities.css
    │   └── webcam.css
    ├── js/
    │   ├── floodmap.js
    │   └── outagemap.js
    ├── temporary/
    │   ├── maintenance.html
    │   ├── maintenance.css
    │   └── maintenance.js
    └── resources/
```

## Installation & Setup

### Prerequisites

- Node.js
- npm

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/lolitemaultes/lismore-flood-dashboard.git
   cd lismore-flood-dashboard/lismore-flood-proxy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   node server.js
   ```

4. Access the dashboard:
   ```
   http://localhost:3000
   ```

### Configuration

The server supports the following environment variables:

- `PORT`: Server port (default: 3000)
- `VERBOSE_LOGGING`: Enable detailed logging (default: false)

Example:
```bash
PORT=8080 VERBOSE_LOGGING=true node server.js
```

## API Endpoints

The server exposes the following API endpoints:

- **GET /flood-data**: Returns parsed flood data from the BoM website
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

### Adding New Data Sources

To add new data sources, modify the `server.js` file to include additional endpoints or modify the existing flood data parsing logic.

## Data Sources

The dashboard aggregates data from multiple authoritative sources:

- **Bureau of Meteorology (BoM)**: Real-time river gauge data and flood warnings
- **BoM Grafton Radar**: Animated rainfall radar imagery
- **Transport for NSW**: Live traffic camera feeds from Bruxner Highway
- **Essential Energy**: Power outage information for the region
- **Lismore City Council**: Floor height data for flood impact mapping

## Troubleshooting

### Server won't start
- Verify all dependencies are installed with `npm install`
- Ensure Node.js is installed and up to date
- Check that port 3000 (or your configured port) is not in use

### Data not loading
- Check your internet connection
- Verify the BoM website is accessible
- Enable verbose logging to see detailed error messages: `VERBOSE_LOGGING=true node server.js`

### Radar images not displaying
- The server automatically fetches and caches radar images
- If images fail to load, check the `/cleanup-radar` endpoint to clear cached images
- Verify access to `reg.bom.gov.au` and `bom.gov.au`

## Development

### Technologies Used

- **Backend**: Node.js, Express
- **Data Fetching**: Axios
- **HTML Parsing**: Cheerio
- **CORS**: Enabled for cross-origin requests
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Disclaimer

This dashboard is intended for emergency use and information purposes. Always follow directions from emergency services during flood events. The data presented is sourced from official channels but may not always be up-to-date or accurate due to network issues or other technical constraints.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Bureau of Meteorology](http://www.bom.gov.au) for providing river height data
- [Transport for NSW](https://www.transport.nsw.gov.au) for traffic camera feeds
- [Essential Energy](https://www.essentialenergy.com.au) for power outage information

## Contact & Support

For issues, feature requests, or contributions, please open an issue on this repository.
