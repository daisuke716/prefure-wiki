import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [{type: 'autogenerated', dirName: '.'}],
  lifeSkillSidebar: [
  	{
  		type: 'category',
  		label: 'Life Skills',
  		link: {
	  		type: 'generated-index',
	  		title: 'Life Skills',
		  	description: 'Life skills here.',
  		},
  		items: [
  			{type: 'autogenerated', dirName: 'lifeSkills'},
  		],
  	},
  ],
  technologySidebar: 
  [
  {
  	type: 'category',
  	label: 'Technology',
  	link: {
  		type: 'generated-index',
  		title: 'Technology',
	  	description: 'Errors and Solustions here.',
  	},
  	items: [
	  	{type: 'autogenerated', dirName: 'technology'},
  		],
  	},
  ],
  errorsSolutionsSidebar: 
  [
  {
  	type: 'category',
  	label: 'Errors & Solustions',
  	link: {
  		type: 'generated-index',
  		title: 'Errors & Solustions',
	  	description: 'Errors and Solustions here.',
  	},
  	items: [
	  	{type: 'autogenerated', dirName: 'logs/error-solutions'},
  		],
  	},
  ],
  languageLearningSidebar2: [
  	{type: 'html', value: 'Language Learning', className: 'sidebar-title'},
  	{type: 'autogenerated', dirName: 'notes/languageLearning'},
  ],
//  othersSidebar: [{type: 'autogenerated', dirName: 'notes/others'}],
  languageLearningSidebar: [
  {
  	type: 'category',
  	label: 'Language Learning',
  	link: {
  		type: 'generated-index',
  		title: 'Language Learning',
	  	description: 'Language learning notes here.',
  	},
  	items: [
	  	{type: 'autogenerated', dirName: 'notes/languageLearning'},
  		],
  	},
  ],

};

export default sidebars;
