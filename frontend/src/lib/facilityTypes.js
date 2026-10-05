import { School, Tent, Hospital, Store, Church, Landmark, Droplets } from 'lucide-react';

// One entry per facility type. Labels adapt forms and cards to each type.
export const FACILITY_TYPES = {
  school: {
    label: 'School', plural: 'Schools', icon: School,
    people: 'Learners', staff: 'Teachers', codeLabel: 'EMIS code',
    subtypes: ['Primary', 'Secondary', 'Tertiary', 'Early childhood centre'],
  },
  evacuation_centre: {
    label: 'Evacuation centre', plural: 'Evacuation centres', icon: Tent,
    people: 'Shelter capacity (people)', staff: 'Camp staff / volunteers', codeLabel: 'Site code',
    subtypes: ['Designated centre', 'Temporary camp', 'Relocation site'],
  },
  health_facility: {
    label: 'Health facility', plural: 'Health facilities', icon: Hospital,
    people: 'Catchment population', staff: 'Health workers', codeLabel: 'MHFR code',
    subtypes: ['Hospital', 'Health centre', 'Clinic', 'Dispensary', 'Health post'],
  },
  market: {
    label: 'Market', plural: 'Markets', icon: Store,
    people: 'Traders and visitors per day', staff: 'Market staff', codeLabel: 'Market code',
    subtypes: ['Daily market', 'Weekly market'],
  },
  place_of_worship: {
    label: 'Place of worship', plural: 'Places of worship', icon: Church,
    people: 'Congregation size', staff: 'Leaders / staff', codeLabel: 'Code',
    subtypes: ['Church', 'Mosque', 'Other'],
  },
  community_hall: {
    label: 'Community hall', plural: 'Community halls', icon: Landmark,
    people: 'Hall capacity (people)', staff: 'Caretakers', codeLabel: 'Code',
    subtypes: ['Community hall', 'Community centre', 'Youth centre'],
  },
  water_point: {
    label: 'Water point', plural: 'Water points', icon: Droplets,
    people: 'People served', staff: 'Caretakers', codeLabel: 'Water point ID',
    subtypes: ['Borehole', 'Protected well', 'Water kiosk', 'Communal tap'],
  },
};

export const TYPE_KEYS = Object.keys(FACILITY_TYPES);
export const typeOf = (key) => FACILITY_TYPES[key] || FACILITY_TYPES.school;

export const DISTRICTS = ['Balaka', 'Blantyre', 'Chikwawa', 'Chiradzulu', 'Chitipa', 'Dedza', 'Dowa', 'Karonga', 'Kasungu',
  'Likoma', 'Lilongwe', 'Machinga', 'Mangochi', 'Mchinji', 'Mulanje', 'Mwanza', 'Mzimba', 'Neno', 'Nkhata Bay', 'Nkhotakota',
  'Nsanje', 'Ntcheu', 'Ntchisi', 'Phalombe', 'Rumphi', 'Salima', 'Thyolo', 'Zomba'];
