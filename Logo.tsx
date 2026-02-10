
import React from 'react';

export const SoulSyncLogo = ({ className = "size-24" }: { className?: string }) => (
  <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="soulGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#8b5cf6' }} />
        <stop offset="50%" style={{ stopColor: '#ec4899' }} />
        <stop offset="100%" style={{ stopColor: '#f43f5e' }} />
      </linearGradient>
    </defs>
    <path 
      d="M100 170 C 60 140, 20 100, 20 60 C 20 30, 50 15, 75 15 C 90 15, 100 25, 100 35 C 100 25, 110 15, 125 15 C 150 15, 180 30, 180 60 C 180 100, 140 140, 100 170 Z" 
      fill="url(#soulGradient)"
      className="drop-shadow-2xl"
    />
    <circle cx="70" cy="65" r="14" fill="white" fillOpacity="0.2" />
    <circle cx="70" cy="65" r="10" fill="white" />
    <circle cx="130" cy="65" r="14" fill="white" fillOpacity="0.2" />
    <circle cx="130" cy="65" r="10" fill="white" />
    <path 
      d="M100 170 C 80 150, 60 120, 60 90 C 60 60, 80 40, 100 40" 
      stroke="white" 
      strokeWidth="4" 
      fill="none" 
      opacity="0.1"
      strokeLinecap="round"
    />
  </svg>
);
