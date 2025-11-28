#!/bin/bash

# FFmpeg Installation Script
# This script helps install FFmpeg on different platforms

echo "FFmpeg Installation Helper"
echo "=========================="

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected: macOS"
    echo "Installing FFmpeg using Homebrew..."
    if command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo "Error: Homebrew not found. Please install Homebrew first:"
        echo "https://brew.sh"
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected: Linux"
    if command -v apt-get &> /dev/null; then
        echo "Installing FFmpeg using apt-get..."
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    elif command -v yum &> /dev/null; then
        echo "Installing FFmpeg using yum..."
        sudo yum install -y ffmpeg
    else
        echo "Error: Package manager not found. Please install FFmpeg manually."
        exit 1
    fi
else
    echo "Error: Unsupported OS. Please install FFmpeg manually."
    echo "Visit: https://ffmpeg.org/download.html"
    exit 1
fi

# Verify installation
if command -v ffmpeg &> /dev/null; then
    echo ""
    echo "✅ FFmpeg installed successfully!"
    echo "Version:"
    ffmpeg -version | head -n 1
else
    echo ""
    echo "❌ FFmpeg installation failed. Please install manually."
    exit 1
fi



