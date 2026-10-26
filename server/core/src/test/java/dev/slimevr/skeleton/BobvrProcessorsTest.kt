package dev.slimevr.skeleton

import dev.slimevr.buildTestSettings
import dev.slimevr.skeleton.inputprocessors.ModHeelsInputProcessor
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import kotlinx.coroutines.test.runTest
import solarxr_protocol.datatypes.BodyPart
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BobvrProcessorsTest {
	private fun pointing(dir: Vector3) = Quaternion.fromTo(Vector3.NEG_Y, dir.unit())

	private fun legs(leftThigh: Vector3, leftShin: Vector3, rightThigh: Vector3, rightShin: Vector3): InputSkeleton {
		val bones: InputSkeleton = bodyPartMap()
		bones[BodyPart.HIP] = DEFAULT_BONE_INPUT.copy(bodyPart = BodyPart.HIP, isRotationActive = true)
		val parts = mapOf(
			BodyPart.LEFT_UPPER_LEG to leftThigh,
			BodyPart.LEFT_LOWER_LEG to leftShin,
			BodyPart.RIGHT_UPPER_LEG to rightThigh,
			BodyPart.RIGHT_LOWER_LEG to rightShin,
		)
		for ((part, dir) in parts) bones[part] = DEFAULT_BONE_INPUT.copy(bodyPart = part, rotation = pointing(dir), isRotationActive = true)
		return bones
	}

	private val thighForward = Vector3(0f, -0.2f, -1f)
	private val shinBackRaised = Vector3(0f, 0.25f, 1f)
	private val down = Vector3(0f, -1f, 0f)

	@Test
	fun `sitting on both heels the shins are laid flat`() = runTest {
		val bones = legs(thighForward, shinBackRaised, thighForward, shinBackRaised)
		ModHeelsInputProcessor(buildTestSettings(backgroundScope)).process(bones, 1.7f)
		val shinY = bones[BodyPart.LEFT_LOWER_LEG]!!.rotation.sandwich(Vector3.NEG_Y).y
		assertTrue(shinY <= 0.121f, "shin should be about flat, was $shinY")
	}

	@Test
	fun `standing on one leg the bent leg is not touched`() = runTest {
		val bones = legs(thighForward, shinBackRaised, down, down)
		val before = bones[BodyPart.LEFT_LOWER_LEG]!!.rotation
		ModHeelsInputProcessor(buildTestSettings(backgroundScope)).process(bones, 1.7f)
		assertEquals(before, bones[BodyPart.LEFT_LOWER_LEG]!!.rotation)
	}
}
