import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import Translate, {translate} from '@docusaurus/Translate';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

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
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/daisuke716/prefure-wiki/edit/main/',
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
	   gtag: {
          trackingID: 'G-X1J1K0844G',
          anonymizeIP: true,
        },
        
      } satisfies Preset.Options,
    ],
  ],
  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM',
      crossorigin: 'anonymous',
    },
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
           ],
        },
        {
        	label: 'Projects',
        	position: 'left',
        	type: 'docSidebar',
        	sidebarId: 'projectsSidebar',
        },

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
     links: [
       {
         title: 'Docs',
         items: [
           {
             label: 'Technology',
            //  href: 'https://stackoverflow.com/questions/tagged/docusaurus',
           to:'/docs/category/technology',
          },
           {
            label: 'Logs',
            href: 'https://stackoverflow.com/questions/tagged/docusaurus',
          },
          {
            label: 'Life Skills',
            href: 'https://stackoverflow.com/questions/tagged/docusaurus',
          },
          {
            label: 'Notes',
            href: 'https://stackoverflow.com/questions/tagged/docusaurus',
          },
          {
            label: 'Projects',
            href: 'https://stackoverflow.com/questions/tagged/docusaurus',
          },
         ],
       },
       {
         title: 'Community',
         items: [
           {
             label: 'Stack Overflow',
             href: 'https://stackoverflow.com/questions/tagged/docusaurus',
           },
           {
             label: 'Discord',
             href: 'https://discordapp.com/invite/docusaurus',
           },
           {
             label: 'Twitter',
             href: 'https://twitter.com/docusaurus',
           },
         ],
       },
       {
         title: 'More',
         items: [
           {
             label: 'GitHub',
             href: 'https://github.com/facebook/docusaurus',
           },
           {
            html: `
            <a href="https://pages.github.com/" target="_blank" rel="noreferrer noopener" aria-label="Deploys by GitHub Pages">
              <img src="https://pages.github.com/images/logo.svg" alt="Deploys by GitHub Pages" width="169" height="34" />
            </a>
          `,
          },
          {
            html: `
            <a href="https://www.cloudflare.com" target="_blank" rel="noreferrer noopener" aria-label="Deploys by CloudFlare">
              <img src="/img/cloudflare.svg" alt="Deploys by CloudFlare" width="163" height="24"/>
            </a>
          `,
          },
          {
            html: `
            <a href="https://www.netlify.com" target="_blank" rel="noreferrer noopener" aria-label="Deploys by Netlify">
              <img src="https://www.netlify.com/img/global/badges/netlify-color-accent.svg" alt="Deploys by Netlify" width="114" height="51" />
            </a>
          `,
          },
           {
            html: `
            <a href="https://argos-ci.com" target="_blank" rel="noreferrer noopener" aria-label="Covered by Argos">
              <img src="https://argos-ci.com/badge.svg" alt="Covered by Argos" width="133" height="20" />
            </a>
          `,
          },
         ],
       },
       {
          title: 'Freind Links',
          items: [
            {
              label: 'Power\'s Wiki',
              href: 'https://wiki-power.com',
            },
            {
              label: '时间笔记',
              href: 'https://xiaomayo.cn',
            },
            {
              label: 'BigZebra',
              href: 'https://blog.bigzebra.cc',
            },

          ]
       }
     ],
     logo: {
      alt: 'Meta Open Source Logo',
      src: '/img/meta_opensource_logo_negative.svg',
      href: 'https://opensource.fb.com',
      // width: 160,
      // height: 51,
    },
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
