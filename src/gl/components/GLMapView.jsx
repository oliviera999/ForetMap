import React from 'react';
import { GLGameBoard } from './GLGameBoard.jsx';

export function GLMapView({ gameState, onMoveMascot, canMoveMascot }) {
  return (
    <GLGameBoard
      chapter={gameState?.game}
      markers={gameState?.markers || []}
      teams={gameState?.teams || []}
      onMarkerClick={onMoveMascot}
      canMoveMascot={canMoveMascot}
    />
  );
}
