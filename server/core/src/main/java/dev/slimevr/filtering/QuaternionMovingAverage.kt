package dev.slimevr.filtering

import com.jme3.system.NanoTimer
import dev.slimevr.VRServer
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Quaternion.Companion.IDENTITY

// influences the range of smoothFactor.
private const val SMOOTH_MULTIPLIER = 42f
private const val SMOOTH_MIN = 11f

// influences the range of predictFactor
private const val PREDICT_MULTIPLIER = 15f
private const val PREDICT_MIN = 10f

// how many past rotations are used for prediction.
private const val PREDICT_BUFFER = 6

// SlimeVR Mod: a tracker that stops sending for longer than this (Wi-Fi hiccup)
// is "in a gap": no extrapolation during it, and the catch-up after it glides
private const val GAP_SECONDS = 0.06f

// SlimeVR Mod: a jump bigger than this between two packets is a glitch, glide too
private const val JUMP_RADIANS = 0.5f // ~30 deg

// SlimeVR Mod: how long the glide after a gap or a jump lasts
private const val GLIDE_SECONDS = 0.12f

class QuaternionMovingAverage(
	val type: TrackerFilters,
	var amount: Float = 0f,
	initialRotation: Quaternion = IDENTITY,
) {
	var filteredQuaternion = IDENTITY
	var filteringImpact = 0f

	// SlimeVR Mod: the filter works on innerQuaternion, filteredQuaternion is
	// what goes out (the same, or gliding toward it after a gap)
	private var innerQuaternion = IDENTITY
	private var lastPacketNanos = 0L
	private var glideActive = false
	private var glideFrom = IDENTITY
	private var glideElapsed = 0f
	private var smoothFactor = 0f
	private var predictFactor = 0f
	private var rotBuffer: CircularArrayList<Quaternion>? = null
	private var latestQuaternion = IDENTITY
	private var smoothingQuaternion = IDENTITY
	private val fpsTimer = if (VRServer.instanceInitialized) VRServer.instance.fpsTimer else NanoTimer()
	private var timeSinceUpdate = 0f

	init {
		// amount should range from 0 to 1.
		// GUI should clamp it from 0.01 (1%) or 0.1 (10%)
		// to 1 (100%).
		amount = amount.coerceAtLeast(0f)
		if (type == TrackerFilters.SMOOTHING) {
			// lower smoothFactor = more smoothing
			smoothFactor = SMOOTH_MULTIPLIER * (1 - amount.coerceAtMost(1f)) + SMOOTH_MIN
			// Totally a hack
			if (amount > 1) {
				smoothFactor /= amount
			}
		}
		if (type == TrackerFilters.PREDICTION) {
			// higher predictFactor = more prediction
			predictFactor = PREDICT_MULTIPLIER * amount + PREDICT_MIN
			rotBuffer = CircularArrayList(PREDICT_BUFFER)
		}

		// We have no reference at the start, so just use the initial rotation
		resetQuats(initialRotation, initialRotation)
	}

	// Runs at up to 1000hz. We use a timer to make it framerate-independent
	// since it runs a bit below 1000hz in practice.
	@Synchronized
	fun update() {
		if (type == TrackerFilters.PREDICTION) {
			val rotBuf = rotBuffer
			if (rotBuf != null && rotBuf.isNotEmpty()) {
				// Applies the past rotations to the current rotation
				val predictRot = rotBuf.fold(latestQuaternion) { buf, rot -> buf * rot }

				// SlimeVR Mod: no packet for a while (Wi-Fi hiccup): stop
				// extrapolating, the last movement isn't going on
				val target = if (fluidGaps && secondsSinceLastPacket() > GAP_SECONDS) latestQuaternion else predictRot

				// Calculate how much to slerp
				// Limit slerp by a reasonable amount so low TPS doesn't break tracking
				val amt = (predictFactor * fpsTimer.timePerFrame).coerceAtMost(1f)

				// Slerps the target rotation to that predicted rotation by amt
				innerQuaternion = innerQuaternion.interpQ(target, amt)
			}
		} else if (type == TrackerFilters.SMOOTHING) {
			// Make it framerate-independent
			timeSinceUpdate += fpsTimer.timePerFrame

			// Calculate the slerp factor based off the smoothFactor and smoothingCounter
			// limit to 1 to not overshoot
			val amt = (smoothFactor * timeSinceUpdate).coerceAtMost(1f)

			// Smooth towards the target rotation by the slerp factor
			innerQuaternion = smoothingQuaternion.interpQ(latestQuaternion, amt)
		}

		// SlimeVR Mod: after a gap or a jump, glide to the filtered rotation
		// instead of snapping to it
		if (glideActive && type != TrackerFilters.NONE) {
			glideElapsed += fpsTimer.timePerFrame
			val t = (glideElapsed / GLIDE_SECONDS).coerceIn(0f, 1f)
			val eased = t * t * (3f - 2f * t)
			filteredQuaternion = glideFrom.interpQ(innerQuaternion, eased)
			if (t >= 1f) glideActive = false
		} else {
			filteredQuaternion = innerQuaternion
		}

		filteringImpact = latestQuaternion.angleToR(filteredQuaternion)
	}

	private fun secondsSinceLastPacket(): Float = if (lastPacketNanos == 0L) 0f else (System.nanoTime() - lastPacketNanos) / 1e9f

	@Synchronized
	fun addQuaternion(q: Quaternion) {
		val oldQ = latestQuaternion
		val newQ = q.twinNearest(oldQ)
		latestQuaternion = newQ

		// SlimeVR Mod: first packet after a Wi-Fi hiccup, or a sudden jump
		val gap = secondsSinceLastPacket()
		lastPacketNanos = System.nanoTime()
		val catchUp = fluidGaps &&
			type != TrackerFilters.NONE &&
			(gap > GAP_SECONDS || oldQ.angleToR(newQ) > JUMP_RADIANS)
		if (catchUp) {
			glideFrom = filteredQuaternion
			glideElapsed = 0f
			glideActive = true
		}

		if (type == TrackerFilters.PREDICTION) {
			if (catchUp) {
				// The move over the gap isn't a speed to extrapolate:
				// predicting from it overshoots and snaps back
				rotBuffer?.clear()
			} else {
				if (rotBuffer!!.size == rotBuffer!!.capacity()) {
					rotBuffer?.removeLast()
				}

				// Gets and stores the rotation between the last 2 quaternions
				rotBuffer?.add(oldQ.inv().times(newQ))
			}
		} else if (type == TrackerFilters.SMOOTHING) {
			timeSinceUpdate = 0f
			smoothingQuaternion = innerQuaternion
		} else {
			// No filtering; just keep track of rotations (for going over 180 degrees)
			filteredQuaternion = newQ
			innerQuaternion = newQ
		}
	}

	/**
	 * Aligns the quaternion space of [q] to the [reference] and sets the latest
	 * [filteredQuaternion] immediately
	 */
	companion object {
		/**
		 * SlimeVR Mod: smooth catch-up after Wi-Fi hiccups. Off in the
		 * "Origine" profile (mod corrections off), like the official version.
		 */
		@JvmStatic
		@Volatile
		var fluidGaps = true
	}

	@Synchronized
	fun resetQuats(q: Quaternion, reference: Quaternion) {
		// Assume a rotation within 180 degrees of the reference
		// TODO: Currently the reference is the headset, this restricts all trackers to
		//  have at most a 180 degree rotation from the HMD during a reset, we can
		//  probably do better using a hierarchy
		val rot = q.twinNearest(reference)
		rotBuffer?.clear()
		latestQuaternion = rot
		filteredQuaternion = rot
		innerQuaternion = rot
		glideActive = false
		lastPacketNanos = 0L
		addQuaternion(rot)
	}
}
