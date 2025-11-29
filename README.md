
<img width="4052" height="904" alt="LismoreFloodDashboard-Banner" src="https://github.com/user-attachments/assets/d522c1c1-d64d-49b3-af96-fd2edb93e87d" />

# Lismore Flood Dashboard

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
[![Live Dashboard](https://img.shields.io/badge/Lismore-Flood%20Dashboard-blue)](https://flood.lolitemaultes.online)

A real-time emergency dashboard for monitoring flood conditions in the Lismore, NSW area. This application aggregates critical information from multiple official sources to assist emergency management personnel and the public during flood events.

## Features

- **Interactive Flood Impact Map**
- **Realistic Floodwater Elevation Simulation**
- **Interactive River Height Graphs**
- **Live River Height Information**
- **Traffic Webcam Integration**
- **Interactive Rainfall Radar**
- **Live Power Outage Map**
- **Emergency Information**
- **Basic Flood Statistics**
- **Desktop Optimized (Mobile support in development)**

## Technical Architecture

The dashboard consists of a modular backend and a responsive frontend:

1. **Frontend**: 
   - Located in `public/`.
   - Built with Vanilla JavaScript, HTML5, and CSS3.
   - Uses **Leaflet.js** for all mapping features (Flood, Radar, Outages).
   - Implements a responsive design with a dark/light mode theme switcher.

2. **Backend**: 
   - **Node.js & Express**: Acts as a proxy server and data aggregator.
   - **Modular Structure**:
     - `routes/`: API route definitions.
     - `services/`: Business logic and external API interactions (BOM, Essential Energy, etc.).
     - `config/`: Centralized configuration.
     - `middleware/`: Rate limiting, validation, and error handling.
     - `utils/`: Shared utilities (logging, date formatting).

## Installation & Setup

### Prerequisites

- Node.js (v22+ recommended)
- npm

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/lolitemaultes/lismore-flood-dashboard.git
   cd lismore-flood-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Access the dashboard:
   ```
   http://localhost:3000
   ```

### Configuration

The server is configured via environment variables and configuration files:

- **Environment Variables** (`.env`):
  - `PORT`: Server port (default: 3000).
  - `VERBOSE_LOGGING`: Enable detailed logging (default: false).

- **Project Configuration**:
  - `config/config.js`: Centralizes URLs, headers, and application constants.
  - `config/radarStations.json`: Defines available radar stations.

## API Endpoints

The server exposes a RESTful API:

- **General**
  - `GET /status`: System health check.
  - `GET /api`: API index.

- **Flood Data**
  - `GET /flood-data`: Parsed river height data from BoM.
  - `GET /api/flood-properties`: Static property data for flood mapping.

- **Radar**
  - `GET /api/radar/frames`: Radar animation frames (timestamp metadata).
  - `GET /api/radar/weatherchaser/image/:radarId/:timestamp`: Proxy for radar overlay images.

- **Utilities & Services**
  - `GET /api/outages`: Essential Energy power outage data (GeoJSON).
  - `GET /proxy/webcam`: Live traffic camera image proxy.
  - `GET /api/check-cyclone`: Status of cyclone tracking map.
  - `GET /elevation`: Elevation data lookup (for flood simulation).

## Data Sources

The dashboard aggregates data from multiple authoritative sources:

- **Bureau of Meteorology (BoM)**: Real-time river gauge data and cyclone maps.
- **The Weather Chaser**: Rainfall radar imagery.
- **Transport for NSW**: Live traffic camera feeds (Bruxner Highway).
- **Essential Energy**: Power outage information (KML/GeoJSON).
- **Mapzen / AWS S3**: Global elevation tiles for flood impact visualization.
- **Lismore City Council**: Floor height data for property-level flood impact mapping.

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

- [Bureau of Meteorology](https://www.bom.gov.au) for providing river height data
- [The Weather Chaser](https://theweatherchaser.com) for providing radar imagery via BoM
- [Transport for NSW](https://www.transport.nsw.gov.au) for traffic camera feeds
- [Essential Energy](https://www.essentialenergy.com.au) for power outage information

## Contact & Support

For issues, feature requests, or contributions, please open an issue on this repository.
