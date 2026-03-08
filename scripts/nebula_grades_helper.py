#!/usr/bin/env python3
"""
Helper functions for displaying Nebula grade data in the frontend.
"""
import json
from typing import Dict, List, Optional

class NebulaGrades:
    def __init__(self, data_path: str = "public/nebula_data.json"):
        with open(data_path) as f:
            self.data = json.load(f)

        self.grades = self.data.get('gradesBySection', {})
        self.professors = self.data.get('professorsBySection', {})
        self.courses = self.data.get('courses', [])

        # Create lookups
        self.course_lookup = {}
        self.section_lookup = {}
        for course in self.courses:
            course_id = course.get('_id')
            course_name = f"{course.get('subject_prefix')} {course.get('course_number')}"
            self.course_lookup[course_id] = course

            for section_id in course.get('sections', []):
                self.section_lookup[section_id] = course

    def get_course_grades(self, course_code: str) -> List[Dict]:
        """
        Get all grade distributions for a specific course (e.g., 'CS 3340')
        Returns list of section grade data
        """
        subject, number = course_code.split()
        sections_data = []

        for course in self.courses:
            if (course.get('subject_prefix') == subject and
                course.get('course_number') == number):

                for section_id in course.get('sections', []):
                    if section_id in self.grades:
                        grade_data = self.grades[section_id]
                        prof_data = self.professors.get(section_id, [])

                        sections_data.append({
                            'section_id': section_id,
                            'course_name': course_code,
                            'grades': grade_data,
                            'professors': prof_data,
                            'title': course.get('title', ''),
                        })

        return sections_data

    def get_section_grades(self, section_id: str) -> Optional[Dict]:
        """
        Get grade distribution for a specific section
        """
        if section_id not in self.grades:
            return None

        course = self.section_lookup.get(section_id)
        if not course:
            return None

        return {
            'section_id': section_id,
            'course_name': f"{course.get('subject_prefix')} {course.get('course_number')}",
            'course_title': course.get('title', ''),
            'grades': self.grades[section_id],
            'professors': self.professors.get(section_id, []),
        }

    def format_grade_distribution(self, grade_array: List[int]) -> Dict:
        """
        Convert raw grade array to readable format
        """
        if not isinstance(grade_array, list) or len(grade_array) < 14:
            return {}

        grade_labels = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W']
        grade_points = {'A+': 4.0, 'A': 4.0, 'A-': 3.67, 'B+': 3.33, 'B': 3.0, 'B-': 2.67,
                      'C+': 2.33, 'C': 2.0, 'C-': 1.67, 'D+': 1.33, 'D': 1.0, 'D-': 0.67, 'F': 0.0}

        total_students = sum(grade_array[:14])
        distribution = {}
        total_points = 0
        valid_grades = 0

        for label, count in zip(grade_labels, grade_array[:14]):
            if count > 0:
                percentage = (count / total_students * 100) if total_students > 0 else 0
                distribution[label] = {
                    'count': count,
                    'percentage': round(percentage, 1)
                }

                if label in grade_points:
                    total_points += grade_points[label] * count
                    valid_grades += count

        avg_gpa = total_points / valid_grades if valid_grades > 0 else 0

        return {
            'total_students': total_students,
            'distribution': distribution,
            'average_gpa': round(avg_gpa, 2),
        }

# Example usage for frontend integration
if __name__ == "__main__":
    nebula = NebulaGrades()

    # Example: Get grades for ACCT 2301
    acct2301_sections = nebula.get_course_grades("ACCT 2301")

    print("ACCT 2301 Grade Analysis:")
    for section in acct2301_sections[:3]:  # Show first 3 sections
        formatted = nebula.format_grade_distribution(section['grades'])
        print(f"\nSection {section['section_id'][:8]}...")
        print(f"  Total students: {formatted['total_students']}")
        print(f"  Average GPA: {formatted['average_gpa']}")
        print("  Top grades:")
        for grade, data in list(formatted['distribution'].items())[:5]:
            print(f"    {grade}: {data['count']} ({data['percentage']}%)")