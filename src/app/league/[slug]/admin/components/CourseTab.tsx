"use client";

import { useState, useEffect } from "react";
import {
  createCourse,
  updateCourse,
  getCourseWithHoles,
  type CourseWithHoles,
  type HoleInput,
} from "@/lib/actions/courses";

interface CourseTabProps {
  slug: string;
  leagueId: number;
}

const PAR_PRESETS: { label: string; pars: number[] }[] = [
  { label: "Par 36 (4-4-4-3-5-4-4-3-5)", pars: [4, 4, 4, 3, 5, 4, 4, 3, 5] },
  { label: "Par 35 (4-4-3-4-5-4-3-4-4)", pars: [4, 4, 3, 4, 5, 4, 3, 4, 4] },
  { label: "Par 34 (4-3-4-3-5-4-3-4-4)", pars: [4, 3, 4, 3, 5, 4, 3, 4, 4] },
  { label: "Par 27 (all par 3s)", pars: [3, 3, 3, 3, 3, 3, 3, 3, 3] },
];

function defaultHoles(count: number): HoleInput[] {
  return Array.from({ length: count }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    handicapIndex: i + 1,
    yardage: null,
  }));
}

export default function CourseTab({ slug, leagueId }: CourseTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Course data
  const [existingCourse, setExistingCourse] = useState<CourseWithHoles | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [numberOfHoles, setNumberOfHoles] = useState(9);
  const [teeColor, setTeeColor] = useState("");
  const [courseRating, setCourseRating] = useState<number | "">("");
  const [slopeRating, setSlopeRating] = useState<number | "">("");
  const [holes, setHoles] = useState<HoleInput[]>(defaultHoles(9));

  useEffect(() => {
    loadCourse();
  }, [leagueId]);

  async function loadCourse() {
    try {
      const course = await getCourseWithHoles(slug);
      if (course) {
        setExistingCourse(course);
        setName(course.name);
        setLocation(course.location || "");
        setNumberOfHoles(course.numberOfHoles);
        setTeeColor(course.teeColor || "");
        setCourseRating(course.courseRating ?? "");
        setSlopeRating(course.slopeRating ?? "");
        setHoles(
          course.holes.map((h) => ({
            holeNumber: h.holeNumber,
            par: h.par,
            handicapIndex: h.handicapIndex,
            yardage: h.yardage,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load course:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleHoleCountChange(count: number) {
    if (count < holes.length) {
      const confirmed = window.confirm(
        `Switching to ${count} holes will discard holes ${count + 1}-${holes.length}. Continue?`
      );
      if (!confirmed) return;
    }
    setNumberOfHoles(count);
    if (count > holes.length) {
      // Add more holes
      const extra = Array.from({ length: count - holes.length }, (_, i) => ({
        holeNumber: holes.length + i + 1,
        par: 4,
        handicapIndex: holes.length + i + 1,
        yardage: null as number | null,
      }));
      setHoles([...holes, ...extra]);
    } else {
      setHoles(holes.slice(0, count));
    }
  }

  function updateHole(index: number, field: keyof HoleInput, value: number | null) {
    setHoles((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    );
  }

  function applyParPreset(pars: number[]) {
    setHoles((prev) =>
      prev.map((h, i) => ({
        ...h,
        par: i < pars.length ? pars[i] : h.par,
      }))
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const data = {
        name,
        location: location || null,
        numberOfHoles,
        teeColor: teeColor || null,
        courseRating: courseRating === "" ? null : courseRating,
        slopeRating: slopeRating === "" ? null : slopeRating,
        holes,
      };

      const result = existingCourse
        ? await updateCourse(slug, existingCourse.id, data)
        : await createCourse(slug, data);

      if (result.success) {
        setExistingCourse(result.data);
        setMessage({ type: "success", text: existingCourse ? "Course updated!" : "Course created!" });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleSave error:", error);
      setMessage({ type: "error", text: "Failed to save course." });
    }
    setSaving(false);
  }

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);

  if (loading) {
    return <div className="text-text-muted font-sans">Loading course data...</div>;
  }

  return (
    <div>
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg font-sans ${
            message.type === "success"
              ? "bg-fairway/10 border border-fairway/30 text-fairway"
              : "bg-error-bg border border-error-border text-error-text"
          }`}
        >
          {message.text}
        </div>
      )}

      <h2 className="text-xl font-display font-semibold mb-6 text-scorecard-pencil uppercase tracking-wider">
        {existingCourse ? "Edit Course" : "Set Up Course"}
      </h2>

      {/* Course Info */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="course-name" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
            Course Name *
          </label>
          <input
            id="course-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pine Valley Golf Club"
            className="pencil-input w-full"
          />
        </div>
        <div>
          <label htmlFor="course-location" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
            Location
          </label>
          <input
            id="course-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Clementon, NJ"
            className="pencil-input w-full"
          />
        </div>
        <div>
          <label htmlFor="course-tee-color" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
            Tee Color
          </label>
          <input
            id="course-tee-color"
            type="text"
            value={teeColor}
            onChange={(e) => setTeeColor(e.target.value)}
            placeholder="e.g. White, Blue"
            className="pencil-input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
            Number of Holes
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleHoleCountChange(9)}
              className={`px-4 py-2 rounded-lg font-display font-semibold uppercase tracking-wider text-sm transition-colors ${
                numberOfHoles === 9
                  ? "bg-fairway text-white"
                  : "bg-bunker/20 text-text-secondary hover:bg-bunker/30"
              }`}
            >
              9 Holes
            </button>
            <button
              type="button"
              onClick={() => handleHoleCountChange(18)}
              className={`px-4 py-2 rounded-lg font-display font-semibold uppercase tracking-wider text-sm transition-colors ${
                numberOfHoles === 18
                  ? "bg-fairway text-white"
                  : "bg-bunker/20 text-text-secondary hover:bg-bunker/30"
              }`}
            >
              18 Holes
            </button>
          </div>
        </div>
      </div>

      {/* Optional Ratings */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="course-rating" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
            Course Rating (optional)
          </label>
          <input
            id="course-rating"
            type="number"
            value={courseRating}
            onChange={(e) => setCourseRating(e.target.value ? parseFloat(e.target.value) : "")}
            step="0.1"
            placeholder="e.g. 72.3"
            className="pencil-input w-32 font-mono tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="course-slope" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
            Slope Rating (optional)
          </label>
          <input
            id="course-slope"
            type="number"
            value={slopeRating}
            onChange={(e) => setSlopeRating(e.target.value ? parseInt(e.target.value) : "")}
            placeholder="e.g. 131"
            className="pencil-input w-32 font-mono tabular-nums"
          />
        </div>
      </div>

      {/* Par Presets */}
      {numberOfHoles === 9 && (
        <div className="mb-4">
          <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
            Quick-Fill Par Layout
          </label>
          <div className="flex flex-wrap gap-2">
            {PAR_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyParPreset(preset.pars)}
                className="px-3 py-1.5 text-xs font-display font-semibold uppercase tracking-wider rounded-lg bg-bunker/20 text-text-secondary hover:bg-bunker/30 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Holes Table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-left">
          <thead className="bg-rough text-white">
            <tr>
              <th className="py-3 px-3 font-display uppercase tracking-wider text-sm w-16">Hole</th>
              <th className="py-3 px-3 font-display uppercase tracking-wider text-sm text-center">Par</th>
              <th className="py-3 px-3 font-display uppercase tracking-wider text-sm text-center">Handicap</th>
              <th className="py-3 px-3 font-display uppercase tracking-wider text-sm text-center">Yardage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-scorecard-line/40">
            {holes.map((hole, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-surface" : "bg-scorecard-paper"}>
                <td className="py-2 px-3 font-mono tabular-nums font-semibold text-scorecard-pencil">
                  {hole.holeNumber}
                </td>
                <td className="py-2 px-3 text-center">
                  <select
                    value={hole.par}
                    onChange={(e) => updateHole(index, "par", parseInt(e.target.value))}
                    aria-label={`Hole ${hole.holeNumber} par`}
                    className="w-16 px-2 py-1 border border-scorecard-line/50 rounded text-center font-mono tabular-nums bg-scorecard-paper focus:outline-none focus:border-fairway"
                  >
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </td>
                <td className="py-2 px-3 text-center">
                  <input
                    type="number"
                    value={hole.handicapIndex}
                    onChange={(e) => updateHole(index, "handicapIndex", parseInt(e.target.value) || 1)}
                    min={1}
                    max={numberOfHoles}
                    aria-label={`Hole ${hole.holeNumber} handicap index`}
                    className="w-16 px-2 py-1 border border-scorecard-line/50 rounded text-center font-mono tabular-nums bg-scorecard-paper focus:outline-none focus:border-fairway"
                  />
                </td>
                <td className="py-2 px-3 text-center">
                  <input
                    type="number"
                    value={hole.yardage ?? ""}
                    onChange={(e) => updateHole(index, "yardage", e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="-"
                    aria-label={`Hole ${hole.holeNumber} yardage`}
                    className="w-20 px-2 py-1 border border-scorecard-line/50 rounded text-center font-mono tabular-nums bg-scorecard-paper focus:outline-none focus:border-fairway"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface border-t-2 border-scorecard-line/50">
            <tr>
              <td className="py-3 px-3 font-display font-semibold uppercase tracking-wider text-sm text-scorecard-pencil">
                Total
              </td>
              <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-fairway">
                {totalPar}
              </td>
              <td className="py-3 px-3"></td>
              <td className="py-3 px-3 text-center font-mono tabular-nums text-text-muted">
                {holes.reduce((sum, h) => sum + (h.yardage || 0), 0) || "-"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="px-6 py-2 bg-fairway text-white rounded-lg hover:bg-rough disabled:opacity-50 font-display font-semibold uppercase tracking-wider transition-colors"
      >
        {saving ? "Saving..." : existingCourse ? "Update Course" : "Create Course"}
      </button>
    </div>
  );
}
