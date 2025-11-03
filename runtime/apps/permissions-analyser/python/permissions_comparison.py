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
        
        # Compare Apex class access
        all_apex_classes = set()
        for profile_data in org_profiles.values():
            for apex_access in profile_data.get('apexClassAccesses', []):
                all_apex_classes.add(apex_access['apexClass'])
        
        for apex_class in all_apex_classes:
            apex_differences = {}
            for org, profile_data in org_profiles.items():
                apex_access = next(
                    (a for a in profile_data.get('apexClassAccesses', []) if a['apexClass'] == apex_class),
                    None
                )
                if apex_access:
                    apex_differences[org] = {'enabled': apex_access.get('enabled', False)}
                else:
                    apex_differences[org] = {'enabled': False}
            
            if self._has_permission_differences(apex_differences):
                differences['apex_access'][apex_class] = apex_differences
        
        # Compare Visualforce page access
        all_pages = set()
        for profile_data in org_profiles.values():
            for page_access in profile_data.get('pageAccesses', []):
                all_pages.add(page_access['apexPage'])
        
        for page in all_pages:
            page_differences = {}
            for org, profile_data in org_profiles.items():
                page_access = next(
                    (p for p in profile_data.get('pageAccesses', []) if p['apexPage'] == page),
                    None
                )
                if page_access:
                    page_differences[org] = {'enabled': page_access.get('enabled', False)}
                else:
                    page_differences[org] = {'enabled': False}
            
            if self._has_permission_differences(page_differences):
                differences['page_access'][page] = page_differences
        
        # Compare user permissions
        all_user_perms = set()
        for profile_data in org_profiles.values():
            for user_perm in profile_data.get('userPermissions', []):
                all_user_perms.add(user_perm['name'])
        
        for perm_name in all_user_perms:
            perm_differences = {}
            for org, profile_data in org_profiles.items():
                user_perm = next(
                    (u for u in profile_data.get('userPermissions', []) if u['name'] == perm_name),
                    None
                )
                if user_perm:
                    perm_differences[org] = {'enabled': user_perm.get('enabled', False)}
                else:
                    perm_differences[org] = {'enabled': False}
            
            if self._has_permission_differences(perm_differences):
                differences['user_permissions'][perm_name] = perm_differences
        
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
        
        # Collect all permission sets from all orgs
        for org, data in self.org_data.items():
            org_permsets = set(data.get('permissionSets', {}).keys())
            permset_comparison['org_permission_sets'][org] = org_permsets
            permset_comparison['all_permission_sets'].update(org_permsets)
        
        # Find common permission sets
        if permset_comparison['org_permission_sets']:
            permset_comparison['common_permission_sets'] = set.intersection(
                *permset_comparison['org_permission_sets'].values()
            )
        
        # Find unique permission sets per org
        for org, permsets in permset_comparison['org_permission_sets'].items():
            unique = permsets - permset_comparison['common_permission_sets']
            if unique:
                permset_comparison['unique_permission_sets'][org] = list(unique)
        
        # Compare permissions for common permission sets
        for permset in permset_comparison['common_permission_sets']:
            differences = self._compare_permission_set_permissions(permset)
            if differences:
                permset_comparison['permission_set_differences'][permset] = differences
        
        return permset_comparison
    
    def _compare_permission_set_permissions(self, permset_name: str) -> Dict[str, Any]:
        """Compare permissions for a specific permission set across orgs"""
        # Permission sets have the same structure as profiles, so we can reuse the logic
        differences = {
            'object_permissions': {},
            'field_permissions': {},
            'apex_access': {},
            'page_access': {},
            'user_permissions': {}
        }
        
        # Get permission set data from all orgs
        org_permsets = {}
        for org, data in self.org_data.items():
            if permset_name in data.get('permissionSets', {}):
                org_permsets[org] = data['permissionSets'][permset_name]
        
        if len(org_permsets) < 2:
            return {}
        
        # Use the same comparison logic as profiles since they have the same structure
        # This is a bit of a hack but avoids code duplication
        temp_profile_data = {}
        for org, permset_data in org_permsets.items():
            temp_profile_data[org] = {'profiles': {permset_name: permset_data}}
        
        # Temporarily swap org_data to reuse profile comparison logic
        original_org_data = self.org_data
        self.org_data = temp_profile_data
        
        # Get differences using profile comparison logic
        profile_diffs = self._compare_profile_permissions(permset_name)
        
        # Restore original org_data
        self.org_data = original_org_data
        
        return profile_diffs
    
    def compare_permission_set_groups(self) -> Dict[str, Any]:
        """Compare permission set groups across organizations"""
        logger.info("Comparing permission set groups...")
        
        psg_comparison = {
            'all_permission_set_groups': set(),
            'org_permission_set_groups': {},
            'common_permission_set_groups': set(),
            'unique_permission_set_groups': {},
            'permission_set_group_differences': {}
        }
        
        # Collect all PSGs from all orgs
        for org, data in self.org_data.items():
            org_psgs = set(data.get('permissionSetGroups', {}).keys())
            psg_comparison['org_permission_set_groups'][org] = org_psgs
            psg_comparison['all_permission_set_groups'].update(org_psgs)
        
        # Find common PSGs
        if psg_comparison['org_permission_set_groups']:
            psg_comparison['common_permission_set_groups'] = set.intersection(
                *psg_comparison['org_permission_set_groups'].values()
            )
        
        # Find unique PSGs per org
        for org, psgs in psg_comparison['org_permission_set_groups'].items():
            unique = psgs - psg_comparison['common_permission_set_groups']
            if unique:
                psg_comparison['unique_permission_set_groups'][org] = list(unique)
        
        # Compare PSG memberships for common PSGs
        for psg in psg_comparison['common_permission_set_groups']:
            differences = self._compare_psg_memberships(psg)
            if differences:
                psg_comparison['permission_set_group_differences'][psg] = differences
        
        return psg_comparison
    
    def _compare_psg_memberships(self, psg_name: str) -> Dict[str, Any]:
        """Compare permission set group memberships across orgs"""
        differences = {
            'permission_sets': {},
            'muting_permission_sets': {}
        }
        
        # Get PSG data from all orgs
        org_psgs = {}
        for org, data in self.org_data.items():
            if psg_name in data.get('permissionSetGroups', {}):
                org_psgs[org] = data['permissionSetGroups'][psg_name]
        
        if len(org_psgs) < 2:
            return {}
        
        # Compare permission set memberships
        all_ps = set()
        for psg_data in org_psgs.values():
            all_ps.update(psg_data.get('permissionSets', []))
        
        for ps in all_ps:
            ps_differences = {}
            for org, psg_data in org_psgs.items():
                ps_differences[org] = {'included': ps in psg_data.get('permissionSets', [])}
            
            if self._has_permission_differences(ps_differences):
                differences['permission_sets'][ps] = ps_differences
        
        # Compare muting permission set memberships
        all_mps = set()
        for psg_data in org_psgs.values():
            all_mps.update(psg_data.get('mutingPermissionSets', []))
        
        for mps in all_mps:
            mps_differences = {}
            for org, psg_data in org_psgs.items():
                mps_differences[org] = {'included': mps in psg_data.get('mutingPermissionSets', [])}
            
            if self._has_permission_differences(mps_differences):
                differences['muting_permission_sets'][mps] = mps_differences
        
        return differences
    
    def compare_muting_permission_sets(self) -> Dict[str, Any]:
        """Compare muting permission sets across organizations"""
        logger.info("Comparing muting permission sets...")
        
        mps_comparison = {
            'all_muting_permission_sets': set(),
            'org_muting_permission_sets': {},
            'common_muting_permission_sets': set(),
            'unique_muting_permission_sets': {},
            'muting_permission_set_differences': {}
        }
        
        # Collect all muting permission sets from all orgs
        for org, data in self.org_data.items():
            org_mps = set(data.get('mutingPermissionSets', {}).keys())
            mps_comparison['org_muting_permission_sets'][org] = org_mps
            mps_comparison['all_muting_permission_sets'].update(org_mps)
        
        # Find common muting permission sets
        if mps_comparison['org_muting_permission_sets']:
            mps_comparison['common_muting_permission_sets'] = set.intersection(
                *mps_comparison['org_muting_permission_sets'].values()
            )
        
        # Find unique muting permission sets per org
        for org, mps in mps_comparison['org_muting_permission_sets'].items():
            unique = mps - mps_comparison['common_muting_permission_sets']
            if unique:
                mps_comparison['unique_muting_permission_sets'][org] = list(unique)
        
        # Compare permissions for common muting permission sets
        # Muting permission sets have the same structure as regular permission sets
        for mps in mps_comparison['common_muting_permission_sets']:
            differences = self._compare_muting_permission_set_permissions(mps)
            if differences:
                mps_comparison['muting_permission_set_differences'][mps] = differences
        
        return mps_comparison
    
    def _compare_muting_permission_set_permissions(self, mps_name: str) -> Dict[str, Any]:
        """Compare permissions for a specific muting permission set across orgs"""
        # Muting permission sets have the same structure as regular permission sets
        differences = {
            'object_permissions': {},
            'field_permissions': {},
            'apex_access': {},
            'page_access': {},
            'user_permissions': {}
        }
        
        # Get muting permission set data from all orgs
        org_mps = {}
        for org, data in self.org_data.items():
            if mps_name in data.get('mutingPermissionSets', {}):
                org_mps[org] = data['mutingPermissionSets'][mps_name]
        
        if len(org_mps) < 2:
            return {}
        
        # Use the same comparison logic as profiles/permission sets
        temp_profile_data = {}
        for org, mps_data in org_mps.items():
            temp_profile_data[org] = {'profiles': {mps_name: mps_data}}
        
        # Temporarily swap org_data to reuse profile comparison logic
        original_org_data = self.org_data
        self.org_data = temp_profile_data
        
        # Get differences using profile comparison logic
        profile_diffs = self._compare_profile_permissions(mps_name)
        
        # Restore original org_data
        self.org_data = original_org_data
        
        return profile_diffs
    
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
            },
            'permission_set_groups': {
                'total': len(self.comparison_results['details'].get('permission_set_groups', {}).get('all_permission_set_groups', [])),
                'common': len(self.comparison_results['details'].get('permission_set_groups', {}).get('common_permission_set_groups', [])),
                'with_differences': len(self.comparison_results['details'].get('permission_set_groups', {}).get('permission_set_group_differences', {}))
            },
            'muting_permission_sets': {
                'total': len(self.comparison_results['details'].get('muting_permission_sets', {}).get('all_muting_permission_sets', [])),
                'common': len(self.comparison_results['details'].get('muting_permission_sets', {}).get('common_muting_permission_sets', [])),
                'with_differences': len(self.comparison_results['details'].get('muting_permission_sets', {}).get('muting_permission_set_differences', {}))
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
            
            # Permission Set differences sheet
            if 'permission_sets' in self.comparison_results['details']:
                permset_diffs = self.comparison_results['details']['permission_sets'].get('permission_set_differences', {})
                if permset_diffs:
                    # Object permissions
                    permset_obj_rows = []
                    for permset, diffs in permset_diffs.items():
                        for obj, obj_perms in diffs.get('object_permissions', {}).items():
                            for org, perms in obj_perms.items():
                                row = {
                                    'PermissionSet': permset,
                                    'Object': obj,
                                    'Organization': org,
                                    **perms
                                }
                                permset_obj_rows.append(row)
                    
                    if permset_obj_rows:
                        permset_df = pd.DataFrame(permset_obj_rows)
                        permset_df.to_excel(writer, sheet_name='PermSet Object Permissions', index=False)
                    
                    # Field permissions
                    permset_field_rows = []
                    for permset, diffs in permset_diffs.items():
                        for field, field_perms in diffs.get('field_permissions', {}).items():
                            for org, perms in field_perms.items():
                                row = {
                                    'PermissionSet': permset,
                                    'Field': field,
                                    'Organization': org,
                                    **perms
                                }
                                permset_field_rows.append(row)
                    
                    if permset_field_rows:
                        field_df = pd.DataFrame(permset_field_rows)
                        field_df.to_excel(writer, sheet_name='PermSet Field Permissions', index=False)
                    
                    # Apex class access
                    apex_rows = []
                    for permset, diffs in permset_diffs.items():
                        for apex_class, apex_perms in diffs.get('apex_access', {}).items():
                            for org, perms in apex_perms.items():
                                row = {
                                    'PermissionSet': permset,
                                    'ApexClass': apex_class,
                                    'Organization': org,
                                    **perms
                                }
                                apex_rows.append(row)
                    
                    if apex_rows:
                        apex_df = pd.DataFrame(apex_rows)
                        apex_df.to_excel(writer, sheet_name='PermSet Apex Access', index=False)
            
            # Permission Set Group differences sheet
            if 'permission_set_groups' in self.comparison_results['details']:
                psg_diffs = self.comparison_results['details']['permission_set_groups'].get('permission_set_group_differences', {})
                if psg_diffs:
                    psg_rows = []
                    for psg, diffs in psg_diffs.items():
                        # Permission set memberships
                        for ps, ps_membership in diffs.get('permission_sets', {}).items():
                            for org, membership in ps_membership.items():
                                row = {
                                    'PermissionSetGroup': psg,
                                    'MemberType': 'PermissionSet',
                                    'MemberName': ps,
                                    'Organization': org,
                                    'Included': membership['included']
                                }
                                psg_rows.append(row)
                        # Muting permission set memberships
                        for mps, mps_membership in diffs.get('muting_permission_sets', {}).items():
                            for org, membership in mps_membership.items():
                                row = {
                                    'PermissionSetGroup': psg,
                                    'MemberType': 'MutingPermissionSet',
                                    'MemberName': mps,
                                    'Organization': org,
                                    'Included': membership['included']
                                }
                                psg_rows.append(row)
                    
                    if psg_rows:
                        psg_df = pd.DataFrame(psg_rows)
                        psg_df.to_excel(writer, sheet_name='PSG Membership Differences', index=False)
    
    def run_comparison(self) -> None:
        """Run the complete comparison process"""
        logger.info(f"Starting permissions comparison: {self.comparison_id}")
        
        # Load data
        self.load_org_data()
        
        if not self.org_data:
            raise ValueError("No organization data found to compare")
        
        if len(self.org_data) < 2:
            raise ValueError("At least 2 organizations are required for comparison")
        
        # Check what types of data we have
        has_profiles = any(org_data.get('profiles') for org_data in self.org_data.values())
        has_permission_sets = any(org_data.get('permissionSets') for org_data in self.org_data.values())
        has_permission_set_groups = any(org_data.get('permissionSetGroups') for org_data in self.org_data.values())
        has_muting_permission_sets = any(org_data.get('mutingPermissionSets') for org_data in self.org_data.values())
        
        logger.info(f"Data contains - profiles: {has_profiles}, permission sets: {has_permission_sets}, "
                   f"PSGs: {has_permission_set_groups}, muting PS: {has_muting_permission_sets}")
        
        # Run comparisons only for data types that exist
        if has_profiles:
            self.comparison_results['details']['profiles'] = self.compare_profiles()
        else:
            logger.info("No profiles found in any organization, skipping profile comparison")
            self.comparison_results['details']['profiles'] = {
                'all_profiles': set(),
                'org_profiles': {},
                'common_profiles': set(),
                'unique_profiles': {},
                'profile_differences': {}
            }
        
        if has_permission_sets:
            self.comparison_results['details']['permission_sets'] = self.compare_permission_sets()
        else:
            logger.info("No permission sets found in any organization, skipping permission set comparison")
            self.comparison_results['details']['permission_sets'] = {
                'all_permission_sets': set(),
                'org_permission_sets': {},
                'common_permission_sets': set(),
                'unique_permission_sets': {},
                'permission_set_differences': {}
            }
        
        if has_permission_set_groups:
            self.comparison_results['details']['permission_set_groups'] = self.compare_permission_set_groups()
        else:
            logger.info("No permission set groups found in any organization, skipping PSG comparison")
            self.comparison_results['details']['permission_set_groups'] = {
                'all_permission_set_groups': set(),
                'org_permission_set_groups': {},
                'common_permission_set_groups': set(),
                'unique_permission_set_groups': {},
                'permission_set_group_differences': {}
            }
        
        if has_muting_permission_sets:
            self.comparison_results['details']['muting_permission_sets'] = self.compare_muting_permission_sets()
        else:
            logger.info("No muting permission sets found in any organization, skipping muting PS comparison")
            self.comparison_results['details']['muting_permission_sets'] = {
                'all_muting_permission_sets': set(),
                'org_muting_permission_sets': {},
                'common_muting_permission_sets': set(),
                'unique_muting_permission_sets': {},
                'muting_permission_set_differences': {}
            }
        
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