/**
 * Example usage of InstagramPreviewScreen component
 * 
 * This component provides an Instagram-style full-screen media preview
 * with smooth animations, cinematic effects, and a modern UI.
 */

import React, { useState } from 'react';
import { Modal } from 'react-native';
import InstagramPreviewScreen from './InstagramPreviewScreen';

const ExampleUsage = () => {
  const [showPreview, setShowPreview] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaType, setMediaType] = useState('photo');

  // Example: When user selects a photo/video
  const handleMediaSelect = (mediaUri, type) => {
    setSelectedMedia(mediaUri);
    setMediaType(type);
    setShowPreview(true);
  };

  // Example suggested audio (optional)
  const suggestedAudio = {
    thumbnail: 'https://example.com/audio-thumb.jpg',
    title: 'Reason Karan Aujl',
    artist: 'Suggested audio',
  };

  return (
    <Modal
      visible={showPreview}
      animationType="none"
      transparent={false}
      onRequestClose={() => setShowPreview(false)}
    >
      {selectedMedia && (
        <InstagramPreviewScreen
          mediaUri={selectedMedia}
          mediaType={mediaType}
          onClose={() => setShowPreview(false)}
          onNext={() => {
            // Navigate to next screen (editing, posting, etc.)
            console.log('Navigate to next screen');
            setShowPreview(false);
          }}
          suggestedAudio={suggestedAudio}
          onAudioPress={() => {
            console.log('Audio button pressed');
            // Open audio selection modal
          }}
          onTextPress={() => {
            console.log('Text button pressed');
            // Open text overlay editor
          }}
          onOverlayPress={() => {
            console.log('Overlay button pressed');
            // Open overlay/sticker selection
          }}
          onFilterPress={() => {
            console.log('Filter button pressed');
            // Open filter selection
          }}
          onEditPress={() => {
            console.log('Edit button pressed');
            // Open advanced editor
          }}
        />
      )}
    </Modal>
  );
};

export default ExampleUsage;

