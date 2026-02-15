npm install
npm start

# Project_FornitoriContratti_Core

Node.js backend project for FornitoriContratti Core.

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```
2. Run the project:
   ```
   npm start
   ```

## API Endpoints

### POST /upload

Upload a PDF file via multipart/form-data.

**Request:**
  - Method: POST
  - URL: `http://localhost:3000/upload`
  - Body: Form-data with key `pdf` and the PDF file as value

**Response:**
  - 200 OK: `{ message: 'PDF uploaded successfully!', filename: '<saved-filename>' }`
  - 400 Bad Request: `{ error: 'No file uploaded or file is not a PDF.' }`

**Example using curl:**
```sh
curl -F "pdf=@yourfile.pdf" http://localhost:3000/upload
```
