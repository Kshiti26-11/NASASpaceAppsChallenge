export default function AboutPage() {
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div className="about-page">
        <h1>About the Harmonized Burning Activity Calendar</h1>

        <p>
          The <strong>Harmonized Burning Activity Calendar</strong> is a web application designed
          for emergency managers, fire responders, climate scientists, and land managers. It delivers
          a unified, consistent multi-decadal record of active fire activity by harmonizing NASA's
          long-term <strong>MODIS</strong> fire record with the finer-resolution <strong>VIIRS</strong> sensor record.
        </p>

        <h2>1. The Problem: Sensor Discontinuity in Satellite Fire Records</h2>
        <p>
          Spaceborne thermal sensors have monitored global active fires for more than two decades,
          primarily through NASA's Fire Information for Resource Management System (FIRMS):
        </p>

        <ul>
          <li>
            <strong>MODIS (Moderate Resolution Imaging Spectroradiometer):</strong> Operational since ~2000
            aboard NASA's Terra and Aqua satellites. MODIS detects thermal anomalies at approximately <strong>1 km spatial resolution</strong>.
            While offering an invaluable 24+ year baseline, MODIS is less sensitive to small, cool, or brief fires and is approaching the end of its operational lifecycle.
          </li>
          <li>
            <strong>VIIRS (Visible Infrared Imaging Radiometer Suite):</strong> Operational since 2012
            aboard the Suomi NPP, NOAA-20, and NOAA-21 satellites. VIIRS features a significantly finer <strong>375 m pixel resolution</strong>.
            It captures much smaller, cooler agricultural burns and smoldering fires that MODIS regularly misses, and serves as the operational sensor moving forward.
          </li>
        </ul>

        <p>
          Because of this dramatic resolution difference, raw hotspot counts from VIIRS are <strong>not directly comparable</strong> to MODIS.
          In identical regions and timeframes, VIIRS reports 2 to 3 times more hotspot detections for the exact same physical fire activity.
          If raw counts are concatenated naively, an abrupt jump appears in 2012—creating a <em>spurious upward trend</em> that misleads fire managers into believing burning abruptly tripled.
        </p>

        <h2>2. Why Harmonization Exists</h2>
        <p>
          To create a single scientifically valid, continuous fire activity calendar from 2000 through the present,
          data from both sensors must be harmonized.
        </p>
        <p>
          During the 2012–present overlap period, both MODIS and VIIRS observed the Earth simultaneously.
          This concurrent observational record allows researchers to compute empirical cross-sensor scaling
          relationships based on land cover, fire intensity, and geographic region.
        </p>

        <p>
          Our pipeline establishes an empirical transfer function leveraging the 2012–2024 concurrent operational
          window. By cross-calibrating Fire Radiative Power (FRP) and localized spatial density scaling factors,
          historical MODIS records are transformed to match the modern VIIRS-equivalent detection benchmark.
        </p>

        <p>
          <strong>Architectural Principle:</strong> The web application strictly consumes <em>already-harmonized data</em>
          (<code>count_harmonized</code>) produced by the upstream processing pipeline. The application itself
          <strong>never</strong> rescales, recalibrates, or applies arbitrary multipliers to raw fire observations.
        </p>

        <h2>3. The Three Observational Eras</h2>
        <div className="era-block">
          <span className="era-dot" style={{ background: '#7E8B9B' }} />
          <div>
            <strong>MODIS-Only Era (2000 – 2011):</strong>
            <br />
            Observations rely exclusively on Terra and Aqua MODIS (1 km). Harmonized counts are scaled to match the modern VIIRS-equivalent detection benchmark.
          </div>
        </div>

        <div className="era-block">
          <span className="era-dot" style={{ background: '#1F4E79' }} />
          <div>
            <strong>Calibration &amp; Overlap Era (2012 – Present):</strong>
            <br />
            Both MODIS and VIIRS operate concurrently. Raw observations from both sensors are presented in the Time Series overlay for total analytical transparency.
          </div>
        </div>

        <div className="era-block">
          <span className="era-dot" style={{ background: '#1A6DE0' }} />
          <div>
            <strong>VIIRS-Dominant Operational Future:</strong>
            <br />
            As MODIS de-orbits, VIIRS (NOAA-20/21) carries forward the continuous record without temporal gaps or recalibration discontinuities.
          </div>
        </div>

        <h2>4. Data Sources and Technical Attribution</h2>
        <p>
          Active fire hotspot detections are sourced from NASA Earthdata FIRMS (Fire Information for Resource Management System):
        </p>
        <ul>
          <li>MODIS Collection 6.1 Thermal Anomalies / Fire (Terra/Aqua)</li>
          <li>VIIRS 375 m Active Fire product (VNP14IMGTDL, VJ114IMGTDL)</li>
          <li>NASA EOSDIS Global Imagery Browse Services (GIBS) for interactive satellite reflectance imagery</li>
        </ul>

        <h2>5. Important Caveats and Scientific Guidance</h2>
        <ul>
          <li>
            <strong>Detections vs. Burned Area:</strong> Hotspots represent pixel-level thermal anomalies detected during satellite overpasses.
            Hotspot count is a proxy for fire occurrences and frequency, <em>not</em> total hectarage or square kilometers of burned area.
          </li>
          <li>
            <strong>Cloud and Smoke Obscuration:</strong> Thick cloud cover and heavy smoke plumes can attenuate thermal infrared signatures,
            preventing detection of actively burning ground.
          </li>
          <li>
            <strong>Orbital Overpass Timing:</strong> Polar-orbiting satellites capture snapshots typically 2 to 4 times daily (e.g., ~10:30 and ~13:30 local solar time).
            Fires that ignite and extinguish between overpass windows may not be registered.
          </li>
          <li>
            <strong>Fire Radiative Power (FRP):</strong> FRP measured in megawatts (MW) quantifies the instantaneous radiant heat output at the moment of observation.
          </li>
        </ul>
      </div>
    </div>
  )
}
