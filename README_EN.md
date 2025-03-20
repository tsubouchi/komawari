# Manga Generator

A simple manga panel editor web application that allows you to select templates, place images, and export them in SVG format.

## Features

- 10 predefined panel layout templates
- Simple operation without drag & drop
- SVG output that preserves image aspect ratios
- Individual image placement for each panel
- Responsive design
- Minimal server-side implementation (Node.js)
- Light and dark mode support

## How to Use

1. Select your preferred panel layout from the template selection screen
2. Place images in each panel on the image placement screen
   - Click on a panel to select it
   - Select an image and press the "Apply" button
   - Or directly click on the preview images at the bottom
3. After placing images in all panels, click the "Save SVG" button
4. Click "Download this SVG" on the preview screen that appears

## Running the Application

```bash
# Start the server
node server.js

# Access in your browser
# http://localhost:3000/
```

## Technical Specifications

- Frontend: HTML, CSS, JavaScript (Vanilla JS)
- Server-side: Node.js
- Libraries: None (using pure DOM API and SVG API)

### SVG Output Mechanism

The SVG output feature is implemented with the following steps:

1. Retrieve panel information from the selected template
2. Encode each placed image in Base64 format
3. Create SVG elements and add group elements for each panel
4. Apply clipping paths to display images in the correct shape
5. Serialize the SVG and convert it to a Blob object
6. Create an Object URL for preview display
7. Use the File API to save the SVG file when downloading

## Screenshots

1. Template selection screen
   ![Template Selection](screenshots/template_selection.png)

2. Image placement screen
   ![Image Placement](screenshots/image_placement.png)

3. SVG output preview
   ![SVG Preview](screenshots/svg_preview.png)

## Important Notes for SVG Implementation

- **Base64 Image Encoding**: Images are converted to Base64 format and inlined because external URL references may not display in SVG due to security restrictions
- **Cross-Origin Constraints**: The `crossOrigin="anonymous"` attribute is set when loading images to avoid CORS constraints
- **SVG Namespace**: The correct namespace (`http://www.w3.org/2000/svg`) must be specified when creating SVG elements
- **Clipping Paths**: Clipping paths are defined in the SVG to display images according to panel shapes
- **Preview Display**: High-quality previews are achieved by using Blob URLs instead of URL encoding the SVG

## Design

The application features both light and dark modes that can be toggled with a button in the header. The design uses a minimalist approach with:

- Clean, modern interface
- Predominantly black and white color scheme
- Clear visual hierarchy
- Responsive layout for all screen sizes

## Update History

### March 20, 2025
- Replaced PNG export feature with SVG saving functionality
- Migrated image processing from server-side to client-side
- Added direct embedding of images with Base64 encoding
- Enhanced preview functionality
- Added loading progress display
- Added light and dark mode support

## Notes

- When running in a local environment, please access via the server to avoid CORS errors with images
- SVG output may use a large amount of memory (especially when using large images)
- Some browsers may have restrictions on external image references 