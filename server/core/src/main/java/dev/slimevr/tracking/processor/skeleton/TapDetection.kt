package dev.slimevr.tracking.processor.skeleton

import dev.slimevr.tracking.trackers.Tracker
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import java.util.*

// class that monitors the acceleration of the waist, hip, chest or upper chest trackers to detect taps
// and use this to trigger a variety of resets (if your wondering why no single tap class exists, it's because
// to many false positives)
class TapDetection(
	val skeleton: HumanSkeleton,
	val trackerToWatch: Tracker,
	// The maximum number of trackers that can accelerate faster than ALLOWED_BODY_ACCEL
	// before tap detection will deactivate
	val maxAllowedMovingTrackers: Int,
	val tapToComplete: Int,
	// VitalVR: reset gestures need a still head. A dance move that shakes the
	// tracker twice (chest pop, floor hit) comes with a moving head, while a
	// real double tap is done standing still, and a yaw reset with the head
	// turned or moving would leave the whole body turned (decalage)
	val needsStillHead: Boolean = false,
	val onTapCompleted: () -> Unit,
) {

	private val accelList = LinkedList<FloatArray>()
	private val tapTimestamps = LinkedList<Float>()
	private var timeWindowNS = 0.3f * tapToComplete * NS_CONVERTER
	private var waitForLowAccel = false
	private var headPositionAtFirstTap: Vector3? = null
	private var headRotationAtFirstTap: Quaternion? = null

	// reset the lists for detecting taps
	fun reset() {
		tapTimestamps.clear()
		accelList.clear()
		waitForLowAccel = false
		headPositionAtFirstTap = null
		headRotationAtFirstTap = null
	}

	// main function for tap detection
	fun update() {
		// get the acceleration of the tracker and add it to the list
		val time = System.nanoTime().toFloat()
		accelList.add(floatArrayOf(trackerToWatch.getAcceleration().len(), time))

		// remove old values from the list (if they are too old)
		while (time - accelList.first()[1] > CLUMP_TIME_NS) {
			accelList.removeFirst()
		}

		// check for a tap
		val accelDelta = accelDelta
		if (accelDelta > NEEDED_ACCEL_DELTA && !waitForLowAccel) {
			// after a tap is added to the list, a lower acceleration
			// is needed before another tap can be added
			if (tapTimestamps.isEmpty()) {
				headPositionAtFirstTap = skeleton.headTracker?.position
				headRotationAtFirstTap = skeleton.headTracker?.getRotation()
			}
			tapTimestamps.add(time)
			waitForLowAccel = true
		}

		// if waiting for low accel
		if (maxAccel < ALLOWED_BODY_ACCEL) {
			waitForLowAccel = false
		}

		// remove old taps from the list (if they are too old)
		if (!tapTimestamps.isEmpty()) {
			while (time - tapTimestamps.first() > timeWindowNS) {
				tapTimestamps.removeFirst()
				if (tapTimestamps.isEmpty()) return
			}
		}

		// if we have no taps within the timeframe or
		// if the user is moving their body too much, reset the tap detector
		if (!isUserStatic(trackerToWatch)) {
			reset()
			return
		}

		if (tapTimestamps.size >= tapToComplete) {
			if (!needsStillHead || !headMoved()) onTapCompleted()
			reset()
		}
	}

	// VitalVR: did the head move or turn since the first tap of the series
	private fun headMoved(): Boolean {
		val head = skeleton.headTracker ?: return false
		val position = headPositionAtFirstTap
		if (head.hasPosition && position != null && (head.position - position).len() > HEAD_MAX_MOVE) {
			return true
		}
		val rotation = headRotationAtFirstTap ?: return false
		// Only turning counts: looking down at the tracker to tap it is fine
		val turn = (head.getRotation() * rotation.inv()).project(Vector3.POS_Y)
		return turn.angleR() > HEAD_MAX_TURN
	}

	private val accelDelta: Float
		get() {
			var max = -999.9f
			var min = 999.9f
			for (`val` in accelList) {
				if (`val`[0] > max) max = `val`[0]
				if (`val`[0] < min) min = `val`[0]
			}
			return max - min
		}

	private val maxAccel: Float
		get() {
			var max = 0.0f
			for (`val` in accelList) {
				if (`val`[0] > max) {
					max = `val`[0]
				}
			}
			return max
		}

	// returns true if the user is not imparting more than allowedBodyAccel of
	// force on any of the torso or upper leg trackers (this sadly implies that
	// you need two or more trackers for this feature to be reliable)
	private fun isUserStatic(trackerToExclude: Tracker): Boolean {
		val trackersToCheck = arrayOf(
			skeleton.upperChestTracker,
			skeleton.chestTracker,
			skeleton.hipTracker,
			skeleton.waistTracker,
			skeleton.leftUpperLegTracker,
			skeleton.rightUpperLegTracker,
			skeleton.leftFootTracker,
			skeleton.rightFootTracker,
		)
		val numMovingTrackers = trackersToCheck.count {
			it != null && it != trackerToExclude && it.getAcceleration().lenSq() > ALLOWED_BODY_ACCEL_SQUARED
		}
		return numMovingTrackers < maxAllowedMovingTrackers
	}

	companion object {
		// hyperparameters
		private const val NS_CONVERTER = 1.0e9f
		private const val NEEDED_ACCEL_DELTA = 6.0f
		private const val ALLOWED_BODY_ACCEL = 2.5f
		private const val ALLOWED_BODY_ACCEL_SQUARED = ALLOWED_BODY_ACCEL * ALLOWED_BODY_ACCEL
		private const val CLUMP_TIME_NS = 0.06f * NS_CONVERTER

		// VitalVR: how much the head may move and turn during a reset gesture
		private const val HEAD_MAX_MOVE = 0.25f
		private val HEAD_MAX_TURN = Math.toRadians(30.0).toFloat()
	}
}
