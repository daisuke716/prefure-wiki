import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import styles from './index.module.css';

import CodeBlock from '@theme/CodeBlock';

import Translate, {translate} from '@docusaurus/Translate';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        {/* <img className="hero-image" src={useBaseUrl("/img/logo1.png")} height="280" 
        alt={
        	translate({
        		message: "Homepage image",
        		description: 'The homepage icon alt message',
        	}) 
        }
        /> */}

      <ThemedImage className="hero-image"  height="280"
        alt={
        	translate({
        		message: "Homepage image",
        		description: 'The homepageogo3.jpg'),
          dark: useBaseUrl('/img/logo1.png'),
        }}
      />;

        <Heading as="h1" className= icon alt message',
        	}) 
        }
        sources={{
          light: useBaseUrl('/img/l"hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">
          <Translate>"Prepare for the Future" --Daisuke Amano</Translate>
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="docs/technology/Docusaurus Introduction/intro">
            <Translate>Start ✅</Translate>
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://nav.prefure.com">
            <Translate>Site Navigation</Translate>
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://resume.prefure.com">
            <Translate>My resume</Translate>
          </Link>
        </div>
	   <CodeBlock
	   	className="hp-codeBlock"
        	language="text"
        	showLineNumbers>
        {`Debug the world.🌎`}
        </CodeBlock>   
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Home`}
      description="Prepare for the Future.">
      <main>
        <HomepageHeader />
      </main>
    </Layout>
  );
}
