# Monitoring Results Widget

A custom ArcGIS Experience Builder widget that displays monitoring results with status indicators for UZCOSMOS, EKOLOGIYA, and PROKRATURA.

## Features

- **Dark Blue Theme**: Modern dark blue interface matching the design specification
- **Status Indicators**: Visual progress bars with colored dots showing status for each monitoring category
- **Three Columns**: 
  - UZCOSMOS: Light blue indicators
  - EKOLOGIYA: Status indicators with red (warning), yellow (caution), or light blue (pending)
  - PROKRATURA: Gray circular icons at the end of dark gray bars
- **Row Selection**: Click on rows to select them (with dashed line indicators)
- **Scrollable Table**: Handles large datasets with custom scrollbar styling

## Usage

1. **Add Widget**: Drag and drop the Monitoring Results widget onto your Experience Builder canvas
2. **Configure Settings**: 
   - Set API Base URL (optional)
   - Set API Token (optional)
   - Configure pagination settings
   - Set up navigation links
3. **View Results**: The widget displays monitoring results in a table format

## Configuration

### Widget Settings

- **API Base URL**: Base URL for the monitoring API (default: `https://geomodul.cmspace.uz/api`)
- **API Token**: JWT token for API authentication
- **Enable Pagination**: Toggle pagination on/off
- **Items Per Page**: Number of items to display per page (default: 20)
- **Navigation Settings**: Configure page navigation when clicking on rows

## Status Indicators

### UZCOSMOS Column
- Light blue dot at the start (0% progress) for pending status

### EKOLOGIYA Column
- **Light blue dot at start (0%)**: Pending status
- **Red dot at ~33%**: Warning status
- **Yellow dot at ~33%**: Caution status

### PROKRATURA Column
- Gray circular icon at the right end (100%) of a dark gray bar
- Indicates completed/finalized status

## Data Structure

The widget expects data in the following format:

```typescript
interface MonitoringResultItem {
  id: string; // UUID identifier
  uzcosmos: {
    status: 'pending' | 'in-progress' | 'completed';
    progress: number; // 0-100
  };
  ekologiya: {
    status: 'pending' | 'warning' | 'caution' | 'completed';
    progress: number; // 0-100
  };
  prokuratura: {
    status: 'pending' | 'completed';
    progress: number; // 0-100
  };
}
```

## Integration with API

To integrate with a real API, modify the `loadData` function in `src/runtime/widget.tsx`:

```typescript
const loadData = async () => {
  setLoading(true);
  setError(null);

  try {
    const apiBaseUrl = props.config.apiBaseUrl || getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/monitoring-results`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch monitoring results');
    }

    const apiData = await response.json();
    // Transform API data to MonitoringResultItem format
    const transformedData = transformApiData(apiData);
    setData(transformedData);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load data');
  } finally {
    setLoading(false);
  }
};
```

## Styling

The widget uses a dark blue theme (`#1a2b4a`) with:
- White text for readability
- Light blue accents (`#4a90e2`) for indicators
- Custom scrollbar styling
- Hover effects on rows
- Selected row highlighting with dashed lines

## Technical Details

- Built with React and TypeScript
- Uses ArcGIS Experience Builder framework
- Responsive design with custom CSS
- Supports row selection and navigation

