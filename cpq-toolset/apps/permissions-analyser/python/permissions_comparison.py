#!/usr/bin/env python3
"""
Permissions Comparison Engine
Analyzes and compares Salesforce permissions across multiple organizations
"""

import json
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
import pandas as pd
from typing import Dict, List, Set, Tuple, Any
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class PermissionsComparison:
    """Main class for comparing permissions across organizations"""
    
    def __init__(self, data_path: str, output_path: str, comparison_id: str):
        self.data_path = Path(data_path)
        self.output_path = Path(output_path)
        self.comparison_id = comparison_id
        self.org_data = {}
        self.comparison_results = {
            'comparison_id': comparison_id,
            'timestamp': datetime.now().isoformat(),
            'summary': {},
            'details': {}
        }
    
    def load_org_data(self) -> None:
        """Load processed permissions data for all organizations"""
        logger.info(f"Loading data from {self.data_path}")
        
        # Find all org directories
        org_dirs = [d for d in self.data_path.iterdir() if d.is_dir() and not d.name.startswith('.')]
        
        for org_dir in org_dirs:
            org_name = org_dir.name
            permissions_file = org_dir / 'processed_permissions.json'
            
            if permissions_file.exists():
                with open(permissions_file, 'r') as f:
                    self.org_data[org_name] = json.load(f)
                logger.info(f"Loaded permissions for {org_name}")
            else:
                logger.warning(f"No permissions data found for {org_name}")
    
    def compare_profiles(self) -> Dict[str, Any]:
        """Compare profiles across organizations"""
        logger.info("Comparing profiles...")
        
        profile_comparison = {
            'all_profiles': set(),
            'org_profiles': {},
            'common_profiles': set(),
            'unique_profiles': {},
            'profile_differences': {}
        }
        
        # Collect all profiles from all orgs
        for org, data in self.org_data.items():
            org_profiles = set(data.get('profiles', {}).keys())
            profile_comparison['org_profiles'][org] = org_profiles
            profile_comparison['all_profiles'].update(org_profiles)
        
        # Find common profiles
        if profile_comparison['org_profiles']:
            profile_comparison['common_profiles'] = set.intersection(
                *profile_comparison['org_profiles'].values()
            )
        
        # Find unique profiles per org
        for org, profiles in profile_comparison['org_profiles'].items():
            unique = profiles - profile_comparison['common_profiles']
            if unique:
                profile_comparison['unique_profiles'][org] = list(unique)
        
        # Compare permissions for common profiles
        for profile in profile_comparison['common_profiles']:
            differences = self._compare_profile_permissions(profile)
            if differences:
                profile_comparison['profile_differences'][profile] = differences
        
        return profile_comparison
    
    def _compare_profile_permissions(self, profile_name: str) -> Dict[str, Any]:
        """Compare permissions for a specific profile across orgs"""
        differences = {
            'object_permissions': {},
            'field_permissions': {},
            'apex_access': {},
            'page_access': {},
            'user_permissions': {}
        }
        
        # Get profile data from all orgs
        org_profiles = {}
        for org, data in self.org_data.items():
            if profile_name in data.get('profiles', {}):
                org_profiles[org] = data['profiles'][profile_name]
        
        if len(org_profiles) < 2:
            return {}
        
        # Compare object permissions
        all_objects = set()
        for profile_data in org_profiles.values():
            for obj_perm in profile_data.get('objectPermissions', []):
                all_objects.add(obj_perm['object'])
        
        for obj in all_objects:
            obj_differences = {}
            for org, profile_data in org_profiles.items():
                obj_perm = next(
                    (p for p in profile_data.get('objectPermissions', []) if p['object'] == obj),
                    None
                )
                if obj_perm:
                    obj_differences[org] = {
                        'create': obj_perm.get('allowCreate', False),
                        'read': obj_perm.get('allowRead', False),
                        'edit': obj_perm.get('allowEdit', False),
                        'delete': obj_perm.get('allowDelete', False),
                        'viewAll': obj_perm.get('viewAllRecords', False),
                        'modifyAll': obj_perm.get('modifyAllRecords', False)
                    }
                else:
                    obj_differences[org] = {
                        'create': False, 'read': False, 'edit': False,
                        'delete': False, 'viewAll': False, 'modifyAll': False
                    }
            
            # Check if there are differences
            if self._has_permission_differences(obj_differences):
                differences['object_permissions'][obj] = obj_differences
        
        # Compare field permissions
        all_fields = set()
        for profile_data in org_profiles.values():
            for field_perm in profile_data.get('fieldPermissions', []):
                all_fields.add(field_perm['field'])
        
        for field in all_fields:
            field_differences = {}
            for org, profile_data in org_profiles.items():
                field_perm = next(
                    (f for f in profile_data.get('fieldPermissions', []) if f['field'] == field),
                    None
                )
                if field_perm:
                    field_differences[org] = {
                        'readable': field_perm.get('readable', False),
                        'editable': field_perm.get('editable', False)
                    }
                else:
                    field_differences[org] = {'readable': False, 'editable': False}
            
            # Check if there are differences
            if self._has_permission_differences(field_differences):
                differences['field_permissions'][field] = field_differences
        
        return differences
    
    def _has_permission_differences(self, permissions_dict: Dict[str, Dict]) -> bool:
        """Check if there are differences in permissions across orgs"""
        if len(permissions_dict) < 2:
            return False
        
        # Get all permission values
        all_values = list(permissions_dict.values())
        first_value = all_values[0]
        
        # Check if all values are the same
        return not all(value == first_value for value in all_values[1:])
    
    def compare_permission_sets(self) -> Dict[str, Any]:
        """Compare permission sets across organizations"""
        logger.info("Comparing permission sets...")
        
        permset_comparison = {
            'all_permission_sets': set(),
            'org_permission_sets': {},
            'common_permission_sets': set(),
            'unique_permission_sets': {},
            'permission_set_differences': {}
        }
        
        # Similar logic to profile comparison but for permission sets
        for org, data in self.org_data.items():
            org_permsets = set(data.get('permissionSets', {}).keys())
            permset_comparison['org_permission_sets'][org] = org_permsets
            permset_comparison['all_permission_sets'].update(org_permsets)
        
        if permset_comparison['org_permission_sets']:
            permset_comparison['common_permission_sets'] = set.intersection(
                *permset_comparison['org_permission_sets'].values()
            )
        
        for org, permsets in permset_comparison['org_permission_sets'].items():
            unique = permsets - permset_comparison['common_permission_sets']
            if unique:
                permset_comparison['unique_permission_sets'][org] = list(unique)
        
        return permset_comparison
    
    def generate_summary_report(self) -> Dict[str, Any]:
        """Generate a summary report of all comparisons"""
        summary = {
            'total_orgs': len(self.org_data),
            'orgs': list(self.org_data.keys()),
            'profiles': {
                'total': len(self.comparison_results['details'].get('profiles', {}).get('all_profiles', [])),
                'common': len(self.comparison_results['details'].get('profiles', {}).get('common_profiles', [])),
                'with_differences': len(self.comparison_results['details'].get('profiles', {}).get('profile_differences', {}))
            },
            'permission_sets': {
                'total': len(self.comparison_results['details'].get('permission_sets', {}).get('all_permission_sets', [])),
                'common': len(self.comparison_results['details'].get('permission_sets', {}).get('common_permission_sets', [])),
                'with_differences': len(self.comparison_results['details'].get('permission_sets', {}).get('permission_set_differences', {}))
            }
        }
        
        return summary
    
    def export_to_excel(self) -> None:
        """Export comparison results to Excel format"""
        excel_path = self.output_path.with_suffix('.xlsx')
        logger.info(f"Exporting results to Excel: {excel_path}")
        
        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            # Summary sheet
            summary_df = pd.DataFrame([self.comparison_results['summary']])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Profile differences sheet
            if 'profiles' in self.comparison_results['details']:
                profile_diffs = self.comparison_results['details']['profiles'].get('profile_differences', {})
                if profile_diffs:
                    profile_rows = []
                    for profile, diffs in profile_diffs.items():
                        for obj, obj_perms in diffs.get('object_permissions', {}).items():
                            for org, perms in obj_perms.items():
                                row = {
                                    'Profile': profile,
                                    'Object': obj,
                                    'Organization': org,
                                    **perms
                                }
                                profile_rows.append(row)
                    
                    if profile_rows:
                        profile_df = pd.DataFrame(profile_rows)
                        profile_df.to_excel(writer, sheet_name='Profile Object Permissions', index=False)
    
    def run_comparison(self) -> None:
        """Run the complete comparison process"""
        logger.info(f"Starting permissions comparison: {self.comparison_id}")
        
        # Load data
        self.load_org_data()
        
        if not self.org_data:
            raise ValueError("No organization data found to compare")
        
        if len(self.org_data) < 2:
            raise ValueError("At least 2 organizations are required for comparison")
        
        # Run comparisons
        self.comparison_results['details']['profiles'] = self.compare_profiles()
        self.comparison_results['details']['permission_sets'] = self.compare_permission_sets()
        
        # Generate summary
        self.comparison_results['summary'] = self.generate_summary_report()
        
        # Save results
        logger.info(f"Saving results to {self.output_path}")
        with open(self.output_path, 'w') as f:
            json.dump(self.comparison_results, f, indent=2, default=str)
        
        # Export to Excel
        try:
            self.export_to_excel()
        except Exception as e:
            logger.warning(f"Failed to export to Excel: {e}")
        
        logger.info("Comparison completed successfully")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Compare Salesforce permissions across organizations')
    parser.add_argument('--data-path', required=True, help='Path to extracted permissions data')
    parser.add_argument('--output-path', required=True, help='Path for output results')
    parser.add_argument('--comparison-id', required=True, help='Unique comparison ID')
    
    args = parser.parse_args()
    
    try:
        comparison = PermissionsComparison(
            args.data_path,
            args.output_path,
            args.comparison_id
        )
        comparison.run_comparison()
        
    except Exception as e:
        logger.error(f"Comparison failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()