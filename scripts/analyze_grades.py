#!/usr/bin/env python3
"""
Analyze Nebula grade distributions and display them properly.
"""
import json
import sys

def analyze_grades():
    if len(sys.argv) < 2:
        print("Usage: python analyze_grades.py <nebula_data.json>")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    grades = data.get('gradesBySection', {})
    courses = data.get('courses', [])

    print("🎓 Nebula Grade Distribution Analysis")
    print("=" * 60)

    # Create a lookup for course info by section
    course_lookup = {}
    for course in courses:
        course_id = course.get('_id')
        course_name = f"{course.get('subject_prefix')} {course.get('course_number')}"
        for section_id in course.get('sections', []):
            course_lookup[section_id] = course_name

    # Analyze grade distributions
    grade_labels = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W']

    for i, (section_id, grade_data) in enumerate(list(grades.items())[:10]):
        course_name = course_lookup.get(section_id, "Unknown Course")

        print(f"\n📚 {course_name} (Section: {section_id[:8]}...)")

        if isinstance(grade_data, list) and len(grade_data) >= 14:
            total_students = sum(grade_data[:14])

            if total_students == 0:
                print("  No grade data available")
                continue

            print(f"  👥 Total students: {total_students}")

            # Calculate GPA-like statistics
            grade_points = {'A+': 4.0, 'A': 4.0, 'A-': 3.67, 'B+': 3.33, 'B': 3.0, 'B-': 2.67,
                          'C+': 2.33, 'C': 2.0, 'C-': 1.67, 'D+': 1.33, 'D': 1.0, 'D-': 0.67, 'F': 0.0}

            total_points = 0
            valid_grades = 0

            print("  📊 Grade Distribution:")
            for label, count in zip(grade_labels, grade_data[:14]):
                if count > 0:
                    percentage = (count / total_students * 100)
                    print(f"    {label}: {count} ({percentage:.1f}%)")

                    if label in grade_points:
                        total_points += grade_points[label] * count
                        valid_grades += count

            if valid_grades > 0:
                avg_gpa = total_points / valid_grades
                print(f"  🎯 Average GPA: {avg_gpa:.2f}")
        else:
            print(f"  Raw data: {grade_data}")

if __name__ == "__main__":
    analyze_grades()