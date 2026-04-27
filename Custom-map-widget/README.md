# Detailed Object Map Widget for ArcGIS Experience Builder

This widget displays comprehensive information about mining objects, including details, calculations, documents, and geographic visualization.

## Features

### 1. Authentication & Authorization
- **Automatic authentication check**: Verifies the presence of authentication token
- **401 error handling**: Gracefully handles unauthorized access attempts
- **Beautiful unauthorized page**: Displays a centered, styled message when user lacks access
- **User-friendly error messages**: Clear explanation of access issues with possible causes
- **Session expiration detection**: Identifies when user sessions have expired

### 2. Object Information Tab
- Displays detailed information about the mining object
- Shows object ID, image ID, owner details, license information
- Interactive map showing the object's geographic location using ArcGIS JS API
- Supports GeoJSON polygon and multipolygon geometries

### 3. Calculation Tab
- File management for topographic maps
- Upload and download capabilities for DEM files
- Analysis results display with volumes and statistics
- Interactive 3D visualization viewer
- Progress tracking for calculations
- Support for ZIP/RAR archive uploads

### 4. Documents Tab
- List of court documents grouped by date
- Download functionality for each document
- File type indicators

### 5. Progress Tracker
- Visual step-by-step progress indicator
- Shows current status: pending, success, or refused
- Responsive design for desktop and mobile

## API Integration

The widget integrates with the following API endpoints:

- `/v1/object-details` - Object details
- `/v1/object-summary` - Object summary information
- `/v1/object-geojson` - Geographic data
- `/v1/status_doc_history` - Document history
- `/v1/analysis-result/{imageId}` - Analysis results
- `/v1/files/download-link/{fileKey}` - File download links
- `/v1/process-archive` - Archive processing
- `/v1/image-data/{imageId}` - Image data management
- `/v1/get-latest-data` - Latest data retrieval

## Configuration

### Widget Settings

1. **Object ID** (Required)
   - The ID of the mining object to display
   - Can be configured in the widget settings panel

2. **API Base URL** (Optional)
   - Override the default API base URL
   - Useful for different environments (dev, staging, production)

### Environment Variables

The widget uses the following environment variable:
- `VITE_API_URL` - Base URL for API requests

## Installation

1. Copy the `detailed-object-map-widget` folder to:
   ```
   client/your-extensions/widgets/
   ```

2. The widget will automatically appear in the widget list in Experience Builder

## Usage

### Adding the Widget to Your Experience

1. Open Experience Builder
2. Navigate to the widget panel
3. Find "Detailed Object Map Widget" in the widget list
4. Drag and drop it onto your page
5. Configure the Object ID in the widget settings
6. Save and preview your experience

### Widget Configuration

1. Click on the widget in the builder
2. Open the settings panel
3. Enter the Object ID for the mining object you want to display
4. (Optional) Set a custom API Base URL
5. Save your changes

## Development

### Project Structure

```
detailed-object-map-widget/
├── manifest.json           # Widget metadata
├── config.json            # Default configuration
├── icon.svg               # Widget icon
├── README.md              # Documentation
├── src/
│   ├── config.ts          # TypeScript configuration interface
│   ├── runtime/           # Runtime components
│   │   ├── widget.tsx     # Main widget component
│   │   ├── style.css      # Widget styles
│   │   ├── api/           # API service layer
│   │   ├── components/    # UI components
│   │   ├── contexts/      # React contexts
│   │   ├── lib/           # Utility functions
│   │   ├── model/         # Data hooks
│   │   ├── types/         # TypeScript type definitions
│   │   └── translations/  # Internationalization
│   └── setting/           # Settings panel
│       └── setting.tsx    # Settings component
```

### Key Components

- **widget.tsx** - Main entry point
- **ObjectNavControl** - Tab navigation
- **ObjectProgressBar** - Progress visualization
- **ObjectInfo** - Information display with map
- **ObjectCalculate** - Calculation and file management
- **ObjectDocs** - Document listing

### API Layer

The widget uses a custom axios-like wrapper built on `fetch` API:
- Automatic token injection from localStorage
- Support for different response types (JSON, Blob, Text)
- Progress tracking for uploads/downloads
- AbortController support for cancellable requests

### State Management

- Uses React Context API for shared state (SummaryProvider)
- Custom hooks for data fetching (useObjectDetails, useObjectSummary, etc.)
- Local component state for UI interactions

## Styling

The widget uses vanilla CSS with BEM-like naming conventions:
- `.widget-detailed-object` - Main container
- `.object-navigation-container` - Tab navigation
- `.progress-bar-container` - Progress indicator
- `.info-container` - Information display
- `.calculate-container` - Calculation section

Responsive breakpoints:
- Desktop: >= 768px
- Mobile: < 768px

## Translations

Currently supported languages:
- English (default)
- Russian (ru)

Translation files are located in:
```
src/runtime/translations/
├── default.ts  # English
└── ru.ts       # Russian
```

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

## Dependencies

### Required ArcGIS Experience Builder Packages
- `jimu-core` - Core Experience Builder functionality
- `jimu-for-builder` - Builder-specific APIs
- `jimu-ui` - UI components

### External Dependencies
- `esri-loader` - ArcGIS JS API loading
- ArcGIS JS API 4.x (loaded via CDN)

## Troubleshooting

### Unauthorized Access Message
If you see the "Доступ запрещен" (Access Denied) message:
- **Check authentication**: Ensure you have an `authToken` in localStorage
- **Re-login**: Your session may have expired - try logging in again
- **Verify permissions**: Contact your administrator if you believe you should have access
- **Clear cache**: Sometimes clearing browser cache and cookies can resolve auth issues

### Widget doesn't load
- Check that Object ID is configured
- Verify API base URL is correct
- Ensure authentication token is present in localStorage

### Map doesn't display
- Ensure GeoJSON data is valid
- Check that ArcGIS JS API is loaded
- Verify spatial reference (should be WKID 4326)

### Files won't upload
- Check file format (must be ZIP or RAR)
- Verify authentication token is valid
- Check network connectivity

### API errors
- Verify API endpoint URLs
- Check authentication token in localStorage (key: `authToken`)
- Review API response in network tab
- Look for 401 Unauthorized responses indicating auth issues

## License

Apache License 2.0

## Support

For issues and feature requests, please contact the development team.

## Version History

### 1.0.0
- Initial release
- Object information display
- Calculation and file management
- Document listing
- Interactive map visualization
- Progress tracking

