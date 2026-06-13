import { Routes, Route } from "react-router-dom";
import { HomeScreen } from "./screens/HomeScreen";
import { StandScreen } from "./screens/StandScreen";
import { SweepScreen } from "./screens/SweepScreen";
import { HeightScreen } from "./screens/HeightScreen";
import { MeasureScreen } from "./screens/MeasureScreen";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { VerifyScreen } from "./screens/VerifyScreen";
import { ReportScreen } from "./screens/ReportScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TutorialScreen } from "./screens/TutorialScreen";

export function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/stand/:standId" element={<StandScreen />} />
        <Route path="/stand/:standId/sweep" element={<SweepScreen />} />
        <Route path="/stand/:standId/height" element={<HeightScreen />} />
        <Route path="/stand/:standId/report" element={<ReportScreen />} />
        <Route path="/measure" element={<MeasureScreen />} />
        <Route path="/calibrate" element={<CalibrationScreen />} />
        <Route path="/verify" element={<VerifyScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/tutorial" element={<TutorialScreen />} />
      </Routes>
    </div>
  );
}
