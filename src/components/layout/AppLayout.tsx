import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F8F7F2] text-[#343832] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 md:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-[#E8E5DC] py-6 text-center text-xs text-[#777D73]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Surface — 3D Structural Surface Inspection Tool</span>
          <span className="text-[#9BA297]">
            Reconstructs surfaces from stereo pairs and measures geometric deviations.
          </span>
        </div>
      </footer>
    </div>
  );
};
