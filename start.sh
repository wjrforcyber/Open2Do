#!/bin/bash

# Open2Do Startup Script

echo "Starting Open2Do..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if .env exists, if not copy from example
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit .env file and add your OpenAI API key if desired."
fi

# Start the application
echo "Starting application on http://localhost:8000"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000