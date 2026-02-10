"use client";

import { useState } from "react";
import { updateLeagueAbout, getLeagueAbout } from "@/lib/actions/league-about";

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
  const [numberOfWeeks, setNumberOfWeeks] = useState<number | "">(initialAbout.numberOfWeeks ?? "");
  const [courseName, setCourseName] = useState(initialAbout.courseName || "");
  const [courseLocation, setCourseLocation] = useState(initialAbout.courseLocation || "");
  const [playDay, setPlayDay] = useState(initialAbout.playDay || "");
  const [playTime, setPlayTime] = useState(initialAbout.playTime || "");
  const [entryFee, setEntryFee] = useState<number | "">(initialAbout.entryFee ?? "");
  const [prizeInfo, setPrizeInfo] = useState(initialAbout.prizeInfo || "");
  const [leagueDescription, setLeagueDescription] = useState(initialAbout.description || "");
  const [contactEmail, setContactEmail] = useState(initialAbout.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(initialAbout.contactPhone || "");

  function populateForm(data: AboutTabProps["initialAbout"]) {
    setLeagueName(data.leagueName || "");
    setStartDate(data.startDate ? new Date(data.startDate).toISOString().split("T")[0] : "");
    setEndDate(data.endDate ? new Date(data.endDate).toISOString().split("T")[0] : "");
    setNumberOfWeeks(data.numberOfWeeks ?? "");
    setCourseName(data.courseName || "");
    setCourseLocation(data.courseLocation || "");
    setPlayDay(data.playDay || "");
    setPlayTime(data.playTime || "");
    setEntryFee(data.entryFee ?? "");
    setPrizeInfo(data.prizeInfo || "");
    setLeagueDescription(data.description || "");
    setContactEmail(data.contactEmail || "");
    setContactPhone(data.contactPhone || "");
  }

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
      populateForm(aboutDataResult);
      setMessage({ type: "success", text: "League information saved successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save league information." });
    }
    setLoading(false);
  }

  return (
    <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg font-sans text-sm ${
            message.type === "success"
              ? "bg-fairway/10 border border-fairway/30 text-fairway"
              : "bg-error-bg border border-error-border text-error-text"
          }`}
        >
          {message.text}
        </div>
      )}

      <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-6 text-scorecard-pencil">About the League</h2>

      <div className="space-y-6">
        <div>
          <label htmlFor="about-league-name" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
            League Name
          </label>
          <input
            id="about-league-name"
            type="text"
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder="e.g., Thursday Night Golf League"
            className="pencil-input w-full"
          />
        </div>

        <div>
          <label htmlFor="about-description" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
            Description
          </label>
          <textarea
            id="about-description"
            value={leagueDescription}
            onChange={(e) => setLeagueDescription(e.target.value)}
            rows={3}
            className="pencil-input w-full"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="about-start-date" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Start Date
            </label>
            <input
              id="about-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="pencil-input w-full"
            />
          </div>
          <div>
            <label htmlFor="about-end-date" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              End Date
            </label>
            <input
              id="about-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="pencil-input w-full"
            />
          </div>
          <div>
            <label htmlFor="about-course-name" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Course Name
            </label>
            <input
              id="about-course-name"
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="pencil-input w-full"
            />
          </div>
          <div>
            <label htmlFor="about-location" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Location
            </label>
            <input
              id="about-location"
              type="text"
              value={courseLocation}
              onChange={(e) => setCourseLocation(e.target.value)}
              className="pencil-input w-full"
            />
          </div>
          <div>
            <label htmlFor="about-play-day" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Play Day
            </label>
            <select
              id="about-play-day"
              value={playDay}
              onChange={(e) => setPlayDay(e.target.value)}
              className="pencil-input w-full"
            >
              <option value="">Select a day...</option>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="about-play-time" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Play Time
            </label>
            <input
              id="about-play-time"
              type="text"
              value={playTime}
              onChange={(e) => setPlayTime(e.target.value)}
              placeholder="e.g., 5:30 PM"
              className="pencil-input w-full"
            />
          </div>
          <div>
            <label htmlFor="about-entry-fee" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Entry Fee ($)
            </label>
            <input
              id="about-entry-fee"
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value ? parseFloat(e.target.value) : "")}
              className="pencil-input w-full"
            />
          </div>
          <div>
            <label htmlFor="about-contact-email" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Contact Email
            </label>
            <input
              id="about-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="pencil-input w-full"
            />
          </div>
        </div>

        <button
          onClick={handleSaveAbout}
          disabled={loading}
          className="px-6 py-2 bg-fairway text-white rounded-lg hover:bg-rough font-display font-semibold uppercase tracking-wider disabled:opacity-50 transition-colors"
        >
          {loading ? "Saving..." : "Save League Information"}
        </button>
      </div>
    </div>
  );
}
