import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import Translate, {translate} from '@docusaurus/Translate';

const config: Config = {
  title: 'PreFure Wiki',
  tagline: '\"Prepare for the Future\" --Daisuke Amano',
  favicon: 'img/logo2.jpg',
  
  // Set the production url of your site here
//  url: 'https://daisuke716.github.io',
  url: 'https://www.prefure.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',
//  baseUrl: '/prefure-wiki/',

  // GitHub pages deployment config.
  // If you aren't using GitHub Pages, you don't need these.
  organizationName: 'daisuke716', // Usually your GitHub org/user name.
  projectName: 'prefure-wiki', // Usually your repo name.
//  projectName: 'daisuke716.github.io',
　trailingSlash: false, //GitHub Pages adds a trailing slash to Docusaurus URLs by default

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja', 'zh'],
    path: 'i18n',
    localeConfigs: {
      en: {
        label: 'English',
        direction: 'ltr',
        htmlLang: 'en-US',
        calendar: 'gregory',
        path: 'en',
      },
      ja: {
        label: '日本語',
        direction: 'ltr',
        htmlLang: 'ja-JP',
        calendar: 'gregory',
        path: 'ja',
      },
      zh: {
        label: '简体中文',
        direction: 'ltr',
        htmlLang: 'zh-CN',
        calendar: 'gregory',
        path: 'zh',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/daisuke716/prefure-wiki/',
        },
//        blog: {
//          showReadingTime: true,
//          feedOptions: {
//            type: ['rss', 'atom'],
//            xslt: true,
//          },
//          // Please change this to your repo.
//          // Remove this to remove the "edit this page" links.
//          editUrl:
//            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
//          // Useful options to enforce blogging best practices
//          onInlineTags: 'warn',
//          onInlineAuthors: 'warn',
//          onUntruncatedBlogPosts: 'warn',
//        },
		blog: false, //disable blog
		
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
    	 hideOnScroll: true,
      title: 'PreFure',
      logo: {
        alt: 'PreFure Wiki Logo',
        src: 'img/logo2.jpg',
      },
      
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'technologySidebar',
          position: 'left',
          label: 'Technology',
        },
        {
          type: 'dropdown',
          label: 'Logs',
          position: 'left',
          items: [
            {
              label: 'Errors & Solutions',
              type: 'docSidebar',
              sidebarId: 'errorsSolutionsSidebar',
            },
           ],
        },
        {
        	label: 'Life Skills',
        	position: 'left',
        	type: 'docSidebar',
        	sidebarId: 'lifeSkillSidebar',
//        	to: '/docs/life-skills',
        },
        {
          type: 'dropdown',
          label: 'Notes',
          position: 'left',
          items: [
            {
              label: 'Language Learning',
              type: 'docSidebar',
              sidebarId: 'languageLearningSidebar',
              
            },
//            {
//              label: 'Others',
////              type: 'docSidebar',
////              sidebarId: 'othersSidebar',
//              to: '/docs/notes/others'
//            },
           ],
        },
//        {to: '/blog', label: 'Blog', position: 'left'},


	   {
          type: 'localeDropdown',
          position: 'right',
          dropdownItemsAfter: [
              {
                type: 'html',
                value: '<hr style="margin: 0.3rem 0;">',
              },
              {
                href: 'https://github.com/facebook/docusaurus/issues/3526',
                label: 'Help Us Translate',
              },
            ],
        },
        {
          href: 'https://github.com/daisuke716/prefure-wiki',
          position: 'right',
		className: 'header-github-link',
  		html: '<i class="fa fa-github"></i>',
  		'aria-label': 'GitHub repository',
        },
//         {
//          type: 'search',
//          position: 'right',
//        },
      ],
    },
    footer: {
      style: 'dark',
//      links: [
//        {
//          title: 'Docs',
//          items: [
//            {
//              label: 'Tutorial',
//              to: '/docs/intro',
//            },
//          ],
//        },
//        {
//          title: 'Community',
//          items: [
//            {
//              label: 'Stack Overflow',
//              href: 'https://stackoverflow.com/questions/tagged/docusaurus',
//            },
//            {
//              label: 'Discord',
//              href: 'https://discordapp.com/invite/docusaurus',
//            },
//            {
//              label: 'Twitter',
//              href: 'https://twitter.com/docusaurus',
//            },
//          ],
//        },
//        {
//          title: 'More',
//          items: [
//            {
//              label: 'Blog',
//              to: '/blog',
//            },
//            {
//              label: 'GitHub',
//              href: 'https://github.com/facebook/docusaurus',
//            },
//          ],
//        },
//      ],
      copyright: `MIT Licensed | Copyright © 2019-${new Date().getFullYear()} Daisuke`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
//      darkTheme: prismThemes.dracula,
      magicComments: [
        // Remember to extend the default highlight class name as well!
        {
          className: 'theme-code-block-highlighted-line',
          line: 'highlight-next-line',
          block: {start: 'highlight-start', end: 'highlight-end'},
        },
        {
          className: 'code-block-error-line',
          line: 'This will error',
        },
      ],
    },
    docs: {
      sidebar: {
        hideable: true,
//        autoCollapseCategories: true,
      },
    },

    algolia: {
      // The application ID provided by Algolia
      appId: '6D6YQBCESA',
      // Public API key: it is safe to commit it
      apiKey: 'd611a52e455f1fe4922dd58c5d75f552',
      indexName: 'prefure',
      // Optional: see doc section below
      contextualSearch: true,
      // Optional: Specify domains where the navigation should occur through window.location instead on history.push. Useful when our Algolia config crawls multiple documentation sites and we want to navigate with window.location.href to them.
      externalUrlRegex: 'external\\.com|domain\\.com',
    // Optional: Replace parts of the item URLs from Algolia. Useful when using the same search index for multiple deployments using a different baseUrl. You can use regexp or string in the `from` param. For example: localhost:3000 vs myCompany.com/docs
      replaceSearchResultPathname: {
        from: '/docs/', // or as RegExp: /\/docs\//
        to: '/',
      },
      // Optional: Algolia search parameters
      searchParameters: {},
      // Optional: path for search page that enabled by default (`false` to disable it)
      searchPagePath: 'search',
      // Optional: whether the insights feature is enabled or not on Docsearch (`false` by default)
      insights: false,
      //... other Algolia params
      
    },
    
  } satisfies Preset.ThemeConfig,

  
};

export default config;
