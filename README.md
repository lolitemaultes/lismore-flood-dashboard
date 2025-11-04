# Lismore Flood Emergency Dashboard

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A real-time emergency dashboard for monitoring flood conditions in the Lismore, NSW area. This application aggregates critical information from multiple official sources to assist emergency management personnel and the public during flood events.

![Lismore Flood Dashboard](https://github.com/user-attachments/assets/406417d6-c64b-4671-b318-690e95b34e34)

## Features

- **Real-Time Flood Impact Map**: This map displays street addresses and areas within Lismore that are currently affected by floods in Lismore, using floor height council data
- **Interactive Flood Height Plot Data**: Provides 4 days of water level height data in an interactive graph
- **Live River Level Monitoring**: Real-time data from Bureau of Meteorology (BoM) gauges
- **Traffic Webcam Integration**: Live view of road conditions at Bruxner Highway
- **Interactive Rainfall Radar**: Animated precipitation patterns from BoM Grafton radar
- **Power Outage Information**: Essential Energy outage data with emergency contact information
- **Emergency Contacts**: Quick access to SES, emergency services, and evacuation centers
- **Console Command Listing**: List of console commands shown for testing purposes
- **Flood Statistics**: At-a-glance metrics for key monitoring stations
- **Responsive Design**: Works on desktop and mobile devices
- **Offline Capability**: Caches data for use during network outages
- **Useful Resource Panel**: Provides links to other websites to help monitor weather activity

## Upcoming Features

- **Flood Map Water Level Simulation**: Simulated water rise visualization on the flood map
- **Localised Rise & Fall Prediction**: Accurate flood level predictions based on historical data

## Technical Architecture

The dashboard consists of two primary components:

1. **Frontend (index.html)**: Browser-based dashboard with responsive UI
2. **Backend (server.js)**: Node.js proxy server to fetch and parse flood data from BoM

```
lismore-flood-proxy/
│
├── server.js          # Proxy server to fetch & parse BoM data
├── package.json       # Node.js dependencies
└── public/
    ├── index.html     # Main dashboard interface
    ├── flood-data.json # Floor height data for map
    └── resources/     # Static assets for the dashboard and user information
```

## Installation & Setup

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
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

   Or directly with Node.js:
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

## Flood Categories

The dashboard uses the following standard BoM flood categories:

| Category | Threshold (meters) | Impact                                      |
|----------|-------------------|---------------------------------------------|
| Minor    | 4.20+             | Low-lying areas near rivers and streams      |
| Moderate | 7.20+             | Above floor flooding of some rural buildings |
| Major    | 9.70+             | Extensive rural and urban flooding           |

## Customization

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

## Data Sources

The dashboard aggregates data from multiple authoritative sources:

- **Bureau of Meteorology (BoM)**: Real-time river gauge data and flood warnings
- **BoM Grafton Radar**: Animated rainfall radar imagery
- **Transport for NSW**: Live traffic camera feeds from Bruxner Highway
- **Essential Energy**: Power outage information for the region
- **Lismore City Council**: Floor height data for flood impact mapping

## Troubleshooting

### Server won't start
- Ensure Node.js is installed and up to date
- Check that port 3000 (or your configured port) is not in use
- Verify all dependencies are installed with `npm install`

### Data not loading
- Check your internet connection
- Verify the BoM website is accessible
- Enable verbose logging to see detailed error messages: `VERBOSE_LOGGING=true node server.js`

### Radar images not displaying
- The server automatically fetches and caches radar images
- If images fail to load, check the `/cleanup-radar` endpoint to clear cached images
- Verify access to `reg.bom.gov.au`

## Development

### Project Structure

- `server.js`: Express server handling data aggregation and proxy requests
- `public/index.html`: Main dashboard interface
- `public/flood-data.json`: Static floor height data for flood impact visualization
- `public/resources/`: Static assets including radar images and documentation

### Technologies Used

- **Backend**: Node.js, Express
- **Data Fetching**: Axios
- **HTML Parsing**: Cheerio
- **CORS**: Enabled for cross-origin requests
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Disclaimer

This dashboard is intended for emergency use and information purposes only. Always follow directions from emergency services during flood events. The data presented is sourced from official channels but may not always be up-to-date or accurate due to network issues or other technical constraints.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Bureau of Meteorology](http://www.bom.gov.au) for providing river height data
- [Transport for NSW](https://www.transport.nsw.gov.au) for traffic camera feeds
- [Essential Energy](https://www.essentialenergy.com.au) for power outage information

## Contact & Support

For issues, feature requests, or contributions, please open an issue on this repository.
