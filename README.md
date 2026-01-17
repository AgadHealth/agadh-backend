# Hiring Backend

This is a Node.js backend for handling hiring applications, built with Express and MongoDB.

## Features

- REST API for user applications
- MongoDB integration using Mongoose
- CORS support for multiple origins
- Environment variable support via `.env`
- Error handling

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- MongoDB URI

### Running the Server

- For development (with auto-reload):
  ```
  npm run dev
  ```
- For production:
  ```
  npm start
  ```

### API Endpoints

- `GET /` — Health check
- `POST /api/users/application` — Submit a hiring application

## API: Submit Application

### Endpoint

`POST /api/users/application`

### Request Body

Send a JSON object with the following fields:

```json
{
  "fullName": "John Doe",
  "kiitMail": "23052670@kiit.ac.in",
  "personalMail": "shivamnad25@gmail.com",
  "contactNumber": "1234567890",
  "linkedin": "https://linkedin.com/in/johndoe",
  "course": "B.Tech",
  "yearOfStudy": "3",
  "domain": "Web Development",
  "experience": "1 year",
  "fitReason": "I am passionate about coding.",
  "domainQ1": "Answer to domain question 1",
  "domainQ2": "Answer to domain question 2",
  "driverLink": "https://drive.google.com/yourfile"
}
```

### Response

#### Success

```json
{
  "success": true,
  "message": "Application submitted successfully."
}
```

#### Error (Email already exists)

```json
{
  "success": false,
  "message": "Email address already exists."
}
```

#### Error (Other server errors)

```json
{
  "error": "Error message describing the issue"
}
```

### Notes

- Both `kiitMail`  must be unique. If either exists, the API returns an error.
- All fields should be sent as strings.

## Project Structure

```
hiring-backend/
├── config/
│   └── connectToMongoDB.js
├── controller/
│   └── userController.js
├── model/
│   └── Application.js
├── routes/
│   └── userRouter.js
├── .env
├── .gitignore
├── index.js
├── package.json
```

## License

MIT
