import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { saveLocale } from '../places/locale';
import { Link } from 'react-router';

import type { CityScene } from './CityScene';
import { LAST_STAGE } from './cityLayout';
import { LOCALES, copyFor } from './copy';
import type { LandingCopy, Locale, PlateCopy, StopCopy } from './copy';
import './landing.css';

export interface LandingPageProps {
  readonly demoUrl: string | null;
  readonly repositoryUrl: string | null;
}

const LOCALE_NAMES: Record<Locale, string> = { en: 'English', pt: 'Português' };

function Arrow({ down = false }: { readonly down?: boolean }) {
  return (
    <svg className={down ? 'lp-i lp-i--down' : 'lp-i'} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />
    </svg>
  );
}

function Plate({ plate }: { readonly plate: PlateCopy }) {
  return (
    <div className={`lp-plate lp-plate--${plate.zone}`}>
      <div className="lp-plate__in">
        <div className="lp-plate__over">{plate.over}</div>
        <div className="lp-plate__name">{plate.name}</div>
        <div className="lp-plate__strip">{plate.strip}</div>
      </div>
    </div>
  );
}

function Stop({ stop, copy }: { readonly stop: StopCopy; readonly copy: LandingCopy }) {
  return (
    <div className="lp-copy">
      <h2 className="lp-h2">{stop.heading}</h2>
      <p className="lp-body">{stop.body}</p>
      <ul className="lp-points">
        {stop.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="lp-proof">
        <dl className="lp-proof__lines">
          {stop.proof.map((line) => (
            <div className="lp-proof__line" key={line.label}>
              <dt>{line.label}</dt>
              <dd>
                {line.tag === 'asking' ? <span className="lp-tag">{copy.asking}</span> : null}
                <span className="lp-proof__value">{line.value}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="lp-prov">
          <span>{stop.provenance}</span>
          <span className="lp-tag lp-tag--synthetic">{copy.synthetic}</span>
        </p>
      </div>
    </div>
  );
}

export function LandingPage({ demoUrl, repositoryUrl }: LandingPageProps) {
  const { i18n } = useTranslation();
  const locale: Locale = i18n.language === 'en' ? 'en' : 'pt';
  const [stage, setStage] = useState(0);
  const [flat, setFlat] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [paused, setPaused] = useState(false);
  const sceneRef = useRef<CityScene | null>(null);
  const motionRef = useRef({ reduced, paused });
  useEffect(() => {
    motionRef.current = { reduced, paused };
    sceneRef.current?.setMotion(reduced, paused);
  }, [reduced, paused]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hereRef = useRef<HTMLDivElement>(null);
  const stopsRef = useRef<HTMLDivElement>(null);

  const copy = copyFor(locale);
  const hero = copy.stops[0];
  const current = copy.stops[stage] ?? hero;

  useEffect(() => {
    document.documentElement.lang = copy.htmlLang;
    document.title = copy.documentTitle;
  }, [copy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stops = stopsRef.current;

    if (!canvas || !stops) {
      return;
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(motionQuery.matches);
    motionQuery.addEventListener('change', onMotion);
    const sections = Array.from(stops.children);
    let scene: CityScene | null = null;
    let cancelled = false;
    let queued = 0;

    function measure(): void {
      queued = 0;

      // The line the stops cross is the top of the sticky stage.
      const line = canvas?.getBoundingClientRect().top ?? 0;
      const tops = sections.map((section) => section.getBoundingClientRect().top - line);
      let progress = LAST_STAGE;

      for (let index = 0; index < tops.length - 1; index += 1) {
        const from = tops[index] ?? 0;
        const to = tops[index + 1] ?? 0;

        if (to > 0) {
          progress = index + Math.min(1, Math.max(0, -from / Math.max(1, to - from)));
          break;
        }
      }

      scene?.setProgress(progress);
      setStage(Math.min(LAST_STAGE, Math.max(0, Math.round(progress))));
    }

    function schedule(): void {
      if (queued === 0) {
        queued = requestAnimationFrame(measure);
      }
    }

    function onResize(): void {
      scene?.resize();
      schedule();
    }

    // three.js is loaded on its own chunk so the copy paints before the scene.
    void import('./CityScene')
      .then(({ mountCityScene }) => {
        if (cancelled) {
          return;
        }

        scene = mountCityScene(canvas, {
          reducedMotion: motionQuery.matches,
          onAnchor(x, y, inView) {
            const here = hereRef.current;

            if (here) {
              here.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
              here.dataset.shown = inView ? 'true' : 'false';
            }
          },
        });

        if (scene) {
          sceneRef.current = scene;
          scene.setMotion(motionRef.current.reduced, motionRef.current.paused);
          schedule();
        } else {
          setFlat(true);
        }
      })
      .catch(() => {
        setFlat(true);
      });

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      motionQuery.removeEventListener('change', onMotion);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(queued);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  function chooseLocale(next: Locale): void {
    const choice = next === 'en' ? 'en' : 'pt-BR';
    saveLocale(choice);
    void i18n.changeLanguage(choice);
  }

  // In-page links scroll by hand so they also work where the document has a base URL.
  function followInPageLink(event: MouseEvent<HTMLDivElement>): void {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    const id = link?.getAttribute('href')?.slice(1);
    const target = id ? document.getElementById(id) : null;

    if (target) {
      event.preventDefault();
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    }
  }

  const action = demoUrl ? (
    <a className="lp-btn lp-btn--primary" href={demoUrl}>
      {copy.openDemo}
      <Arrow />
    </a>
  ) : (
    <a className="lp-btn lp-btn--primary" href="#zone">
      {copy.takeTour}
      <Arrow down />
    </a>
  );

  return (
    <div
      className={flat ? 'lp lp--flat' : 'lp'}
      data-motion={reduced || paused ? 'paused' : 'running'}
      onClick={followInPageLink}
    >
      <a className="lp-skip" href="#zone">
        {copy.skip}
      </a>

      <header className="lp-top">
        <a className="lp-brand" href="#city">
          <span className="lp-brand__mark" aria-hidden="true" />
          Real Estate Intelligence
        </a>
        <div className="lp-lang" role="group" aria-label={copy.languageLabel}>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              lang={option === 'pt' ? 'pt-BR' : 'en'}
              aria-pressed={locale === option}
              aria-label={LOCALE_NAMES[option]}
              onClick={() => chooseLocale(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        {demoUrl ? (
          <a className="lp-btn lp-btn--top" href={demoUrl}>
            {copy.openDemo}
          </a>
        ) : null}
      </header>

      <main>
        <section className="lp-journey">
          <div className="lp-controls">
            {!flat && !reduced ? (
              <button className="lp-motion" type="button" onClick={() => setPaused(!paused)}>
                {paused ? copy.resumeMotion : copy.pauseMotion}
              </button>
            ) : null}
            <nav className="lp-way" aria-label={copy.stopsLabel}>
              <ol>
                {copy.stops.map((stop, index) => (
                  <li key={stop.id}>
                    <a href={`#${stop.id}`} aria-current={index === stage ? 'step' : undefined}>
                      <span className="lp-way__mark" aria-hidden="true" />
                      <span className="lp-way__name">{stop.way}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <div className="lp-stage">
            <canvas ref={canvasRef} className="lp-canvas" aria-hidden="true" />
            <div className="lp-scrim" aria-hidden="true" />
            <div ref={hereRef} className="lp-here" data-shown="false" aria-hidden="true">
              <div className="lp-here__card">
                <span className="lp-here__tag">{copy.here}</span>
                <Plate plate={current?.plate ?? { over: '', name: '', strip: '', zone: 'city' }} />
              </div>
              <span className="lp-here__stem" />
            </div>
          </div>

          <div className="lp-stops" ref={stopsRef}>
            <section className="lp-stop lp-stop--hero" id="city" tabIndex={-1}>
              <div className="lp-copy">
                <h1 className="lp-h1">{copy.heroTitle}</h1>
                <p className="lp-lead">{copy.heroLead}</p>
                <div className="lp-actions">
                  {action}
                  {demoUrl ? (
                    <a className="lp-btn lp-btn--quiet" href="#zone">
                      {copy.heroCue}
                      <Arrow down />
                    </a>
                  ) : (
                    <span className="lp-pending">{copy.demoPending}</span>
                  )}
                </div>
                <p className="lp-prov lp-prov--legend">
                  <span>{copy.heroLegend}</span>
                  <span className="lp-tag lp-tag--synthetic">{copy.synthetic}</span>
                </p>
              </div>
            </section>
            {copy.stops.slice(1).map((stop) => (
              <section className="lp-stop" id={stop.id} key={stop.id} tabIndex={-1}>
                <Stop stop={stop} copy={copy} />
              </section>
            ))}
          </div>
        </section>

        <section className="lp-run">
          <div className="lp-run__intro">
            <h2 className="lp-h2">{copy.runTitle}</h2>
            <p className="lp-body">{copy.runLead}</p>
          </div>
          <ol className="lp-steps">
            {copy.runSteps.map((step, index) => (
              <li className="lp-step" data-kind={index} key={step.state}>
                <span className="lp-step__state">{step.state}</span>
                <p className="lp-step__text">{step.text}</p>
                {step.detail ? (
                  <ul className="lp-step__detail">
                    {step.detail.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {step.note ? <p className="lp-step__note">{step.note}</p> : null}
              </li>
            ))}
            <li className="lp-steps__tag">
              <span className="lp-tag lp-tag--synthetic">{copy.synthetic}</span>
            </li>
          </ol>
        </section>

        <section className="lp-rules">
          <h2 className="lp-h2">{copy.rulesTitle}</h2>
          <dl className="lp-rules__list">
            {copy.rules.map((rule) => (
              <div className="lp-rule" key={rule.rule}>
                <dt>{rule.rule}</dt>
                <dd>{rule.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-close">
          <div className="lp-close__call">
            <h2 className="lp-h1 lp-h1--close">{copy.closeTitle}</h2>
            <p className="lp-lead">{copy.closeLead}</p>
            <div className="lp-actions">
              {demoUrl ? (
                <a className="lp-btn lp-btn--primary" href={demoUrl}>
                  {copy.openDemo}
                  <Arrow />
                </a>
              ) : (
                <>
                  <a className="lp-btn lp-btn--primary" href="#city">
                    {copy.takeTour}
                    <Arrow />
                  </a>
                  <span className="lp-pending">{copy.demoPending}</span>
                </>
              )}
              {repositoryUrl ? (
                <a className="lp-btn lp-btn--quiet" href={repositoryUrl}>
                  {copy.source}
                  <Arrow />
                </a>
              ) : null}
            </div>
          </div>
          <div className="lp-status">
            <h3 className="lp-h3">{copy.statusTitle}</h3>
            <p>{copy.statusBuilt}</p>
            <p>{copy.statusDesigned}</p>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <span>{copy.footer}</span>
        <Link to="/privacy">{copy.privacy}</Link>
      </footer>
    </div>
  );
}
