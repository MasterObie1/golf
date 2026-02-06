"use client";

import { useState } from "react";
import { updateLeagueAbout, getLeagueAbout } from "@/lib/actions";

interface AboutTabProps {
  slug: string;
  leagueId: number;
  leagueName: string;
  initialAbout: {
    leagueName: string;
    startDate: Date | null;
    endDate: Date | null;
    numberOfWeeks: number | null;
    courseName: string | null;
    courseLocation: string | null;
    playDay: string | null;
    playTime: string | null;
    entryFee: number | null;
    prizeInfo: string | null;
    description: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
}

export default function AboutTab({ slug, leagueId, leagueName: fallbackName, initialAbout }: AboutTabProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // About the League state
  const [leagueName, setLeagueName] = useState(initialAbout.leagueName || "");
  const [startDate, setStartDate] = useState(
    initialAbout.startDate ? new Date(initialAbout.startDate).toISOString().split("T")[0] : ""
  );
  const [endDate, setEndDate] = useState(
    initialAbout.endDate ? new Date(initialAbout.endDate).toISOString().split("T")[0] : ""
  );
  const [numberOfWeeks, setNumberOfWeeks] = useState<number | "">(initialAbout.numberOfWeeks || "");
  const [courseName, setCourseName] = useState(initialAbout.courseName || "");
  const [courseLocation, setCourseLocation] = useState(initialAbout.courseLocation || "");
  const [playDay, setPlayDay] = useState(initialAbout.playDay || "");
  const [playTime, setPlayTime] = useState(initialAbout.playTime || "");
  const [entryFee, setEntryFee] = useState<number | "">(initialAbout.entryFee || "");
  const [prizeInfo, setPrizeInfo] = useState(initialAbout.prizeInfo || "");
  const [leagueDescription, setLeagueDescription] = useState(initialAbout.description || "");
  const [contactEmail, setContactEmail] = useState(initialAbout.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(initialAbout.contactPhone || "");

  async function handleSaveAbout() {
    setLoading(true);
    setMessage(null);
    try {
      await updateLeagueAbout(slug, {
        leagueName: leagueName || fallbackName,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        numberOfWeeks: numberOfWeeks !== "" ? numberOfWeeks : null,
        courseName: courseName || null,
        courseLocation: courseLocation || null,
        playDay: playDay || null,
        playTime: playTime || null,
        entryFee: entryFee !== "" ? entryFee : null,
        prizeInfo: prizeInfo || null,
        description: leagueDescription || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
      });
      const aboutDataResult = await getLeagueAbout(leagueId);
      setLeagueName(aboutDataResult.leagueName || "");
      setStartDate(aboutDataResult.startDate ? new Date(aboutDataResult.startDate).toISOString().split("T")[0] : "");
      setEndDate(aboutDataResult.endDate ? new Date(aboutDataResult.endDate).toISOString().split("T")[0] : "");
      setNumberOfWeeks(aboutDataResult.numberOfWeeks || "");
      setCourseName(aboutDataResult.courseName || "");
      setCourseLocation(aboutDataResult.courseLocation || "");
      setPlayDay(aboutDataResult.playDay || "");
      setPlayTime(aboutDataResult.playTime || "");
      setEntryFee(aboutDataResult.entryFee || "");
      setPrizeInfo(aboutDataResult.prizeInfo || "");
      setLeagueDescription(aboutDataResult.description || "");
      setContactEmail(aboutDataResult.contactEmail || "");
      setContactPhone(aboutDataResult.contactPhone || "");
      setMessage({ type: "success", text: "League information saved successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save league information." });
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-6 text-gray-800">About the League</h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            League Name
          </label>
          <input
            type="text"
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder="e.g., Thursday Night Golf League"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            value={leagueDescription}
            onChange={(e) => setLeagueDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Name
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <input
              type="text"
              value={courseLocation}
              onChange={(e) => setCourseLocation(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Play Day
            </label>
            <select
              value={playDay}
              onChange={(e) => setPlayDay(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a day...</option>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Play Time
            </label>
            <input
              type="text"
              value={playTime}
              onChange={(e) => setPlayTime(e.target.value)}
              placeholder="e.g., 5:30 PM"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Entry Fee ($)
            </label>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value ? parseFloat(e.target.value) : "")}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <button
          onClick={handleSaveAbout}
          disabled={loading}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save League Information"}
        </button>
      </div>
    </div>
  );
}
